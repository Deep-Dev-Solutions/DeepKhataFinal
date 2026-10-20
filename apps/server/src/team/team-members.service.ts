import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { invalidateUserBranches } from '../auth/branch-access';
import {
  frontendUrl,
  isSyntheticEmail,
  STAFF_EMAIL_DOMAIN,
} from '../auth/auth-mail';
import {
  assertBranchesInBusiness,
  assertOwnerVerified,
  resolveAccess,
} from './team-access';
import { RedisService } from '../redis/redis.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import {
  CreateMemberDto,
  ResetMemberPasswordDto,
  UpdateMemberDto,
} from './dto/team.dto';

export interface TeamActor {
  id: string;
  role: Role;
  businessId: string;
}

const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  displayUsername: true,
  role: true,
  allBranches: true,
  lastActiveAt: true,
  deactivatedAt: true,
  branches: { select: { branchId: true } },
} satisfies Prisma.UserSelect;

type MemberRow = Prisma.UserGetPayload<{ select: typeof MEMBER_SELECT }>;

export interface MemberView {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: Role;
  allBranches: boolean;
  branchIds: string[];
  lastActiveAt: Date | null;
  activeSessions: number;
  deactivatedAt: Date | null;
  isOwner: boolean;
}

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authSessions: AuthSessionsService,
    private readonly redis: RedisService,
    private readonly planLimits: PlanLimitsService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  private toView(row: MemberRow, activeSessions: number): MemberView {
    return {
      id: row.id,
      name: row.name,
      email: isSyntheticEmail(row.email) ? null : row.email,
      username: row.displayUsername,
      role: row.role,
      allBranches: row.allBranches,
      branchIds: row.branches.map((b) => b.branchId),
      lastActiveAt: row.lastActiveAt,
      activeSessions,
      deactivatedAt: row.deactivatedAt,
      isOwner: row.role === Role.OWNER,
    };
  }

  private async clearTeamCache(businessId: string): Promise<void> {
    await Promise.all([
      this.redis.delete(`team:active:${businessId}`),
      this.redis.delete(`team:pending:${businessId}`),
    ]);
  }

  /** Throws 404 unless the user belongs to the caller's business. */
  private async loadTarget(actor: TeamActor, id: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, businessId: actor.businessId },
      select: { id: true, role: true, deactivatedAt: true, allBranches: true },
    });
    if (!target) throw new NotFoundException('Member not found.');
    return target;
  }

  private assertManageable(actor: TeamActor, target: { id: string; role: Role }) {
    if (target.id === actor.id) {
      throw new BadRequestException('You cannot do this to your own account.');
    }
    if (target.role === Role.OWNER) {
      throw new ForbiddenException('The owner account cannot be managed here.');
    }
  }

  async list(actor: TeamActor): Promise<MemberView[]> {
    const rows = await this.prisma.user.findMany({
      where: { businessId: actor.businessId },
      select: MEMBER_SELECT,
      orderBy: [{ createdAt: 'asc' }],
    });
    const counts = await this.prisma.session.groupBy({
      by: ['userId'],
      where: {
        userId: { in: rows.map((r) => r.id) },
        expiresAt: { gt: new Date() },
      },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((c) => [c.userId, c._count._all]));
    return rows.map((r) => this.toView(r, byUser.get(r.id) ?? 0));
  }

  async create(actor: TeamActor, dto: CreateMemberDto) {
    const allowed: Role[] =
      actor.role === Role.OWNER
        ? [Role.MANAGER, Role.STAFF]
        : actor.role === Role.MANAGER
          ? [Role.STAFF]
          : [];
    if (!allowed.includes(dto.role as Role)) {
      throw new ForbiddenException('You are not allowed to create users with this role.');
    }
    await assertOwnerVerified(this.prisma, actor);

    const business = await this.prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { slug: true },
    });
    if (!business) throw new NotFoundException('Business not found.');

    const handle = dto.username;
    const loginUsername = `${handle}@${business.slug}`.toLowerCase();
    const access = resolveAccess(dto);
    await assertBranchesInBusiness(this.prisma, actor.businessId, access.branchIds);

    if (await this.prisma.user.findUnique({ where: { username: loginUsername } })) {
      throw new ConflictException('That username is already taken in your business.');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    let createdId: string;
    try {
      createdId = await this.prisma.$transaction(async (tx) => {
        await this.planLimits.assert(actor.businessId, 'users', 1, tx);
        const user = await tx.user.create({
          data: {
            name: dto.name.trim(),
            email: `${handle}@${business.slug}.${STAFF_EMAIL_DOMAIN}`,
            emailVerified: true,
            username: loginUsername,
            displayUsername: handle,
            role: dto.role as Role,
            businessId: actor.businessId,
            allBranches: access.allBranches,
          },
        });
        await tx.account.create({
          data: {
            id: randomUUID(),
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: hash,
          },
        });
        if (access.branchIds.length > 0) {
          await tx.userBranch.createMany({
            data: access.branchIds.map((branchId) => ({ userId: user.id, branchId })),
          });
        }
        return user.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That username is already taken in your business.');
      }
      throw e;
    }

    invalidateUserBranches(createdId);
    await this.clearTeamCache(actor.businessId);
    const member = await this.view(actor, createdId);
    const loginUrl = `${frontendUrl()}/login`;
    const appName = process.env.APP_NAME || 'DeepKhata';
    return {
      member,
      loginUrl,
      loginUsername,
      whatsappText:
        `Assalam o Alaikum ${dto.name.trim()}, aapka ${appName} account tayyar hai.\n` +
        `Login: ${loginUrl}\nUsername: ${loginUsername}\nPassword: ${dto.password}\n` +
        `Pehli dafa login ke baad password change kar lein.`,
    };
  }

  private async view(actor: TeamActor, id: string): Promise<MemberView> {
    const row = await this.prisma.user.findFirstOrThrow({
      where: { id, businessId: actor.businessId },
      select: MEMBER_SELECT,
    });
    const sessions = await this.prisma.session.count({
      where: { userId: id, expiresAt: { gt: new Date() } },
    });
    return this.toView(row, sessions);
  }

  async update(actor: TeamActor, id: string, dto: UpdateMemberDto) {
    const target = await this.loadTarget(actor, id);
    this.assertManageable(actor, target);

    const touchesBranches = dto.allBranches !== undefined || dto.branchIds !== undefined;
    const roleChanged = dto.role !== undefined && dto.role !== target.role;

    if (touchesBranches) {
      const existing = await this.prisma.userBranch.findMany({
        where: { userId: id },
        select: { branchId: true },
      });
      const access = resolveAccess(dto, {
        allBranches: target.allBranches,
        branchIds: existing.map((e) => e.branchId),
      });
      await assertBranchesInBusiness(this.prisma, actor.businessId, access.branchIds);
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            allBranches: access.allBranches,
            ...(dto.role ? { role: dto.role as Role } : {}),
          },
        });
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (access.branchIds.length > 0) {
          await tx.userBranch.createMany({
            data: access.branchIds.map((branchId) => ({ userId: id, branchId })),
          });
        }
      });
      invalidateUserBranches(id);
    } else if (roleChanged) {
      await this.prisma.user.update({ where: { id }, data: { role: dto.role as Role } });
    }

    // A role change ends the member's sessions so the new role applies at once.
    if (roleChanged) await this.authSessions.revokeAllForUser(id);
    await this.clearTeamCache(actor.businessId);
    return { member: await this.view(actor, id) };
  }

  async resetPassword(actor: TeamActor, id: string, dto: ResetMemberPasswordDto) {
    const target = await this.loadTarget(actor, id);
    this.assertManageable(actor, target);

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { userId: id, providerId: 'credential' },
        select: { id: true },
      });
      if (account) {
        await tx.account.update({ where: { id: account.id }, data: { password: hash } });
      } else {
        await tx.account.create({
          data: {
            id: randomUUID(),
            accountId: id,
            providerId: 'credential',
            userId: id,
            password: hash,
          },
        });
      }
      await tx.user.update({
        where: { id },
        data: { failedAttempts: 0, lockoutUntil: null },
      });
    });
    await this.authSessions.revokeAllForUser(id);
    return { success: true, message: 'Password reset. Share the new password with the member.' };
  }

  async signOutAll(actor: TeamActor, id: string) {
    const target = await this.loadTarget(actor, id);
    this.assertManageable(actor, target);
    await this.authSessions.revokeAllForUser(id);
    return { success: true, message: 'Member signed out of all devices.' };
  }

  async deactivate(actor: TeamActor, id: string) {
    const target = await this.loadTarget(actor, id);
    this.assertManageable(actor, target);
    await this.prisma.user.update({ where: { id }, data: { deactivatedAt: new Date() } });
    await this.authSessions.revokeAllForUser(id);
    await this.clearTeamCache(actor.businessId);
    return { member: await this.view(actor, id) };
  }

  async reactivate(actor: TeamActor, id: string) {
    const target = await this.loadTarget(actor, id);
    this.assertManageable(actor, target);
    if (target.deactivatedAt) {
      await this.prisma.$transaction(async (tx) => {
        await this.planLimits.assert(actor.businessId, 'users', 1, tx);
        await tx.user.update({ where: { id }, data: { deactivatedAt: null } });
      });
      this.tenantCache.invalidateUser(id);
    }
    await this.clearTeamCache(actor.businessId);
    return { member: await this.view(actor, id) };
  }
}
