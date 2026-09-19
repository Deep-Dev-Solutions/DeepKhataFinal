import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { sendInviteEmail } from '../utils/mailer';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async profileInfo(userId: string) {
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
    return { success: true, profile };
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

    // Tier limit enforcement: Max 2 branches
    const branchCount = await this.prisma.branch.count({
      where: { businessId: currentUser.businessId },
    });

    if (branchCount >= 2 && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Base plan limit reached (2 branches). Contact administration to upgrade.',
      );
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

  async inviteStaff(userId: string, data: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId) {
      throw new BadRequestException('No business found.');
    }

    // Tier limit enforcement: Max 5 accounts
    const userCount = await this.prisma.user.count({
      where: { businessId: currentUser.businessId },
    });

    if (userCount >= 5 && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Base plan limit reached (5 accounts). Contact administration to upgrade.',
      );
    }

    const { email, role } = data;
    if (!email || !role) {
      throw new BadRequestException('Missing required fields');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User is already registered.');
    }

    const existingInvite = await this.prisma.invitation.findFirst({
      where: { email, businessId: currentUser.businessId },
    });
    if (existingInvite) {
      throw new BadRequestException('Invitation already sent to this email.');
    }

    const token = crypto.randomBytes(32).toString('hex');

    await this.prisma.invitation.create({
      data: {
        email,
        role,
        businessId: currentUser.businessId,
        token,
      },
    });

    await sendInviteEmail(email, role, token);

    return { success: true, message: 'Invitation sent successfully!' };
  }
}
