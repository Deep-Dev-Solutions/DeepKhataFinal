import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DeviceAuth {
  id: string;
  businessId: string;
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * `Authorization: Device <deviceToken>`. The business always comes from the
 * Device row, never from the request. Sets request.device.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: unknown = request.headers?.authorization;
    const match =
      typeof header === 'string' ? /^Device\s+(\S+)\s*$/i.exec(header) : null;
    if (!match) throw new UnauthorizedException('Device token required');

    const device = await this.prisma.device.findUnique({
      where: { tokenHash: hashDeviceToken(match[1]) },
      select: {
        id: true,
        businessId: true,
        revokedAt: true,
        business: { select: { status: true } },
      },
    });
    if (!device) throw new UnauthorizedException('Unknown device');
    if (device.revokedAt) throw new ForbiddenException('Device revoked');
    if (device.business.status === BusinessStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Account suspended. Contact DeepKhata administration.',
      );
    }

    void this.prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});

    request.device = { id: device.id, businessId: device.businessId } satisfies DeviceAuth;
    return true;
  }
}
