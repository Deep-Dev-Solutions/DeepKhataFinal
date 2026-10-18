import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { sendInviteEmail } from '../utils/mailer.js';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { RedisService } from '../redis/redis.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { PlanLimitsService } from '../plans/plan-limits.service';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private authSessions: AuthSessionsService,
    private redis: RedisService,
    private tenantCache: TenantCacheService,
    private planLimits: PlanLimitsService,
  ) {}

  async getUserBusinessId(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    return u?.businessId ?? null;
  }

  async inviteStaff(
    inviter: { id: string; role: Role; businessId: string },
    data: { email: string; role: Role },
  ) {
    const { email, role } = data;
    const businessId = inviter.businessId;
    if (!email || !role || !businessId)
      throw new BadRequestException('Missing required fields');

    // Role rules: OWNER -> MANAGER|STAFF, MANAGER -> STAFF only.
    const allowedTargets: Role[] =
      inviter.role === 'OWNER'
        ? ['MANAGER', 'STAFF']
        : inviter.role === 'MANAGER'
          ? ['STAFF']
          : [];
    if (!allowedTargets.includes(role)) {
      throw new ForbiddenException(
        'You are not allowed to invite users with this role.',
      );
    }

    await this.planLimits.assert(businessId, 'users');

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser)
      throw new BadRequestException('User is already registered.');

    const existingInvite = await this.prisma.invitation.findFirst({
      where: { email, businessId },
    });
    if (existingInvite)
      throw new BadRequestException('Invitation already sent to this email.');

    const token = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.invitation.create({
      data: { email, role, businessId, token, expiresAt },
    });

    await sendInviteEmail(
      email,
      role,
      token,
      await this.inviteContext(inviter.id, businessId, expiresAt),
    );
    await this.redis.delete(`team:pending:${businessId}`);

    return { success: true, message: 'Invitation sent successfully!' };
  }

  private async inviteContext(
    inviterId: string,
    businessId: string,
    expiresAt: Date,
  ) {
    const [inviter, business] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: inviterId },
        select: { name: true },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
    ]);
    return {
      inviterName: inviter?.name,
      businessName: business?.name,
      businessId,
      expiresAt,
    };
  }

  async invitedByToken(token: string) {
    if (!token) throw new BadRequestException('Token is required');

    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      select: { email: true, role: true, businessId: true },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');

    return { success: true, ...invitation };
  }

  async acceptInvite(data: any) {
    const { token, name, password } = data;
    if (!token || !name || !password)
      throw new BadRequestException('Missing required fields.');

    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation)
      throw new BadRequestException('Invalid or expired invitation link.');

    if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now())
      throw new BadRequestException('Invalid or expired invitation link.');

    // The invitation itself is still in the table, so it is not counted here.
    await this.planLimits.assert(invitation.businessId, 'users', 0);

    const result = await this.prisma.$transaction(async (tx) => {
      const hashPassword = await bcrypt.hash(password, 10);
      const newUser = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          password: hashPassword,
          role: invitation.role,
          businessId: invitation.businessId,
        },
      });
      await tx.invitation.delete({ where: { id: invitation.id } });
      return newUser;
    });

    const { token: accessToken } = await this.authSessions.createSessionFor(
      result.id,
    );

    await Promise.all([
      this.redis.delete(`team:active:${invitation.businessId}`),
      this.redis.delete(`team:pending:${invitation.businessId}`),
    ]);

    return {
      success: true,
      message: 'Account created successfully!',
      accessToken,
      user: result,
    };
  }

  async activeMembers(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('User not found.');

    const cacheKey = `team:active:${currentUser.businessId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const activeMembers = await this.prisma.user.findMany({
      where: { businessId: currentUser.businessId },
      select: { name: true, email: true, role: true },
    });

    const result = {
      success: true,
      businessId: currentUser.businessId,
      members: activeMembers,
    };

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async pendingInvites(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('User not found.');

    const cacheKey = `team:pending:${currentUser.businessId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const pendingInvitations = await this.prisma.invitation.findMany({
      where: { businessId: currentUser.businessId },
      select: { email: true, role: true, createdAt: true },
    });

    const result = {
      success: true,
      businessId: currentUser.businessId,
      pendingInvites: pendingInvitations,
    };

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async updateRole(userId: string, data: any) {
    const { email, role } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, businessId: true },
    });

    if (currentUser?.role !== 'OWNER')
      throw new ForbiddenException('You are not authorized to change roles.');

    const targetUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, businessId: true },
    });
    if (!targetUser) throw new NotFoundException('User not found.');
    if (targetUser.businessId !== currentUser.businessId)
      throw new ForbiddenException(
        'You can only manage users in your own workspace.',
      );
    if (targetUser.id === userId)
      throw new BadRequestException('You cannot change your own role.');

    const updatedUser = await this.prisma.user.update({
      where: { email },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    // A role change ends the member's sessions so the new role applies at once.
    await this.authSessions.revokeAllForUser(updatedUser.id);

    await Promise.all([
      this.redis.delete(`team:active:${currentUser.businessId}`),
      this.redis.delete(`team:pending:${currentUser.businessId}`),
    ]);

    return {
      success: true,
      message: 'Role updated successfully.',
      user: updatedUser,
    };
  }

  async removeMember(userId: string, data: any) {
    const { email } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, businessId: true },
    });
    if (currentUser?.role !== 'OWNER')
      throw new ForbiddenException('You are not authorized to remove members.');

    const targetUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, businessId: true },
    });
    if (!targetUser) throw new NotFoundException('User not found.');
    if (targetUser.businessId !== currentUser.businessId)
      throw new ForbiddenException(
        'You can only remove users from your own workspace.',
      );

    await this.prisma.user.delete({ where: { email } });
    await this.authSessions.revokeAllForUser(targetUser.id);
    await this.redis.delete(`team:active:${currentUser.businessId}`);
    return { success: true, message: 'Member removed successfully.' };
  }

  async resendInvite(userId: string, data: any) {
    const { email, businessId } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, businessId: true },
    });
    if (currentUser?.role !== 'OWNER')
      throw new ForbiddenException(
        'You are not authorized to resend invite to members.',
      );

    const targetInvite = await this.prisma.invitation.findUnique({
      where: {
        email_businessId: { email, businessId: currentUser.businessId },
      },
      select: { id: true, businessId: true, role: true },
    });
    if (!targetInvite) throw new NotFoundException('Invitation not found.');
    if (targetInvite.businessId !== currentUser.businessId)
      throw new ForbiddenException(
        'You can only resend invites to users from your own workspace.',
      );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.invitation.update({
      where: {
        email_businessId: { email, businessId: currentUser.businessId },
      },
      data: { token, expiresAt },
    });
    await sendInviteEmail(
      email,
      targetInvite.role,
      token,
      await this.inviteContext(userId, currentUser.businessId, expiresAt),
    );

    return { success: true, message: 'Invitation resent successfully!' };
  }

  async cancelInvite(userId: string, data: any) {
    const { email } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, businessId: true },
    });
    if (currentUser?.role !== 'OWNER')
      throw new ForbiddenException('You are not authorized to cancel invites.');

    const targetInvite = await this.prisma.invitation.findUnique({
      where: {
        email_businessId: { email, businessId: currentUser.businessId },
      },
      select: { id: true, businessId: true },
    });
    if (!targetInvite) throw new NotFoundException('Invitation not found.');
    if (targetInvite.businessId !== currentUser.businessId)
      throw new ForbiddenException(
        'You can only cancel invites for users from your own workspace.',
      );

    await this.prisma.invitation.delete({
      where: {
        email_businessId: { email, businessId: currentUser.businessId },
      },
    });
    await this.redis.delete(`team:pending:${currentUser.businessId}`);
    return { success: true, message: 'Invitation canceled successfully.' };
  }
}
