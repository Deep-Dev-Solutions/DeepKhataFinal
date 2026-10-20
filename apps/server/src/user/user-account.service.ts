import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './user-account.dto';

export interface OwnSessionView {
  id: string;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

@Injectable()
export class UserAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async listSessions(userId: string, currentSessionId: string): Promise<OwnSessionView[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, ipAddress: true, userAgent: true },
    });
    return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
  }

  async revokeOthers(userId: string, currentSessionId: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return { success: true, revoked: count };
  }

  async changePassword(userId: string, currentSessionId: string, dto: ChangePasswordDto) {
    const account = await this.prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
      select: { id: true, password: true },
    });
    const ok =
      !!account?.password &&
      (await bcrypt.compare(dto.currentPassword, account.password));
    if (!account || !ok) {
      throw new BadRequestException('Current password is incorrect.');
    }
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id: account.id }, data: { password: hash } }),
      this.prisma.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      }),
    ]);
    return { success: true, message: 'Password changed. Other devices were signed out.' };
  }
}
