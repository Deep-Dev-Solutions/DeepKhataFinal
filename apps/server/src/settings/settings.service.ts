import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../redis/redis.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { TeamService } from '../team/team.service';
import { SettingsInviteStaffDto } from '../team/dto/team.dto';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private tenantCache: TenantCacheService,
    private planLimits: PlanLimitsService,
    private team: TeamService,
  ) {}

  async profileInfo(userId: string) {
    const cacheKey = `profile:${userId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (!profile) throw new NotFoundException('Profile not found');
    const result = { success: true, profile };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async businessInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!user || !user.businessId)
      throw new NotFoundException('Business info not found');

    const businessData = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        currency: true,
        address: true,
        logoUrl: true,
        slug: true,
      },
    });

    return { success: true, business: businessData };
  }

  async updateProfileInfo(userId: string, data: any, file?: any) {
    const { name, phone, newPassword } = data;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    if (file && file.path) {
      updateData.avatarUrl = file.path;
    }

    if (newPassword && newPassword.trim() !== '') {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updatedProfile = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });

    await this.redis.delete(`profile:${userId}`);

    return {
      success: true,
      message: 'Profile updated successfully',
      profile: updatedProfile,
    };
  }

  async updateBusinessInfo(userId: string, data: any, file?: any) {
    const { name, phone, email, currency, address } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');
    if (currentUser.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only the workspace owner can change business settings.',
      );
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email) updateData.email = email;
    if (currency) updateData.currency = currency;
    if (address) updateData.address = address;

    if (file && file.path) {
      updateData.logoUrl = file.path;
    }

    const updatedBusiness = await this.prisma.business.update({
      where: { id: currentUser.businessId },
      data: updateData,
    });

    await this.redis.delete(`business:${currentUser.businessId}`);

    return {
      success: true,
      message: 'Business updated successfully',
      business: updatedBusiness,
    };
  }

  async updateBranch(branchId: string, userId: string, data: any) {
    const { name, phone, address } = data; // Note: frontend sends address, which maps to location in DB

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');
    if (currentUser.role !== 'OWNER' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the workspace owner or super admin can edit branches.',
      );
    }

    // Verify branch belongs to the user's business
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.businessId !== currentUser.businessId) {
      throw new NotFoundException('Branch not found or unauthorized');
    }

    const loc = address !== undefined ? address : data.location;

    const updatedBranch = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(loc !== undefined && { location: loc }),
      },
    });

    return {
      success: true,
      message: 'Branch updated successfully',
      branch: updatedBranch,
    };
  }

  async createBranch(userId: string, data: any) {
    const { name, phone, address, location } = data;
    if (!name || !name.trim()) {
      throw new BadRequestException('Branch name is required.');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId) {
      throw new BadRequestException('No business found.');
    }

    if (currentUser.role !== 'OWNER' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the workspace owner or super admin can create branches.',
      );
    }

    // Plan limit (Plan + Subscription.customLimits); SUPER_ADMIN bypasses.
    if (currentUser.role !== 'SUPER_ADMIN') {
      await this.planLimits.assert(currentUser.businessId, 'branches');
    }

    const loc = address !== undefined ? address : location;

    const branch = await this.prisma.branch.create({
      data: {
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        location: loc ? loc.trim() : null,
        businessId: currentUser.businessId,
      },
    });

    return {
      success: true,
      message: 'Branch created successfully',
      branch,
    };
  }

  async deleteBranch(branchId: string, userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');
    if (currentUser.role !== 'OWNER' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the workspace owner or super admin can delete branches.',
      );
    }

    // Verify the branch belongs to the user's business
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.businessId !== currentUser.businessId) {
      throw new NotFoundException('Branch not found or unauthorized');
    }

    // Rule 1: never delete the only remaining (active) branch
    const activeCount = await this.prisma.branch.count({
      where: { businessId: currentUser.businessId, deletedAt: null },
    });
    if (activeCount <= 1) {
      throw new BadRequestException('Cannot delete the only remaining branch');
    }

    // Rule 2: soft-delete the branch. Its cabinets are destroyed, but the
    // physical instances are preserved (untagged from cabinets, still tagged
    // to the soft-deleted branch) so they can be moved to another branch.
    await this.prisma.$transaction(async (tx) => {
      const cabinets = await tx.cabinet.findMany({
        where: { branchId },
        select: { id: true },
      });
      const cabinetIds = cabinets.map((c) => c.id);

      if (cabinetIds.length) {
        await tx.inventoryMovement.updateMany({
          where: { cabinetId: { in: cabinetIds } },
          data: { cabinetId: null },
        });
        await tx.productInstance.updateMany({
          where: { branchId },
          data: { cabinetId: null },
        });
        await tx.cabinet.deleteMany({ where: { branchId } });
      }

      await tx.branch.update({
        where: { id: branchId },
        data: { deletedAt: new Date() },
      });
    });

    this.tenantCache.invalidateBranches(currentUser.businessId);

    return {
      success: true,
      message: 'Branch deleted. Its physical inventory is preserved and can be moved to another branch.',
      deletedBranchId: branchId,
    };
  }

  /**
   * Alias of POST /team/invite. There is one invite implementation
   * (TeamService.inviteStaff): same DTO, 72h expiry, plan limits and role rules.
   */
  async inviteStaff(userId: string, data: SettingsInviteStaffDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });
    if (!currentUser?.businessId) {
      throw new BadRequestException('No business found.');
    }
    return this.team.inviteStaff(
      { id: userId, role: currentUser.role, businessId: currentUser.businessId },
      {
        email: data.email,
        role: data.role,
        allBranches: data.allBranches,
        branchIds: data.branchIds,
      },
    );
  }
}
