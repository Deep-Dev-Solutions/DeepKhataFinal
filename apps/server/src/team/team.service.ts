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
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async inviteStaff(data: any) {
    const { email, role, businessId } = data;
    if (!email || !role || !businessId)
      throw new BadRequestException('Missing required fields');

    // Enforce base tier limit (Max 5 accounts)
    const userCount = await this.prisma.user.count({
      where: { businessId },
    });

    if (userCount >= 5) {
      throw new ForbiddenException(
        'Base plan limit reached (5 accounts). Contact administration to upgrade.',
      );
    }

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

    await this.prisma.invitation.create({
      data: { email, role, businessId, token },
    });

    await sendInviteEmail(email, role, token);

    return { success: true, message: 'Invitation sent successfully!' };
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

    const accessToken = this.jwtService.sign(
      { id: result.id, role: result.role, businessId: result.businessId },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

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

    const activeMembers = await this.prisma.user.findMany({
      where: { businessId: currentUser.businessId },
      select: { name: true, email: true, role: true },
    });

    return {
      success: true,
      businessId: currentUser.businessId,
      members: activeMembers,
    };
  }

  async pendingInvites(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('User not found.');

    const pendingInvitations = await this.prisma.invitation.findMany({
      where: { businessId: currentUser.businessId },
      select: { email: true, role: true, createdAt: true },
    });

    return {
      success: true,
      businessId: currentUser.businessId,
      pendingInvites: pendingInvitations,
    };
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
    await this.prisma.invitation.update({
      where: {
        email_businessId: { email, businessId: currentUser.businessId },
      },
      data: { token },
    });
    await sendInviteEmail(email, targetInvite.role, token);

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
    return { success: true, message: 'Invitation canceled successfully.' };
  }
}
