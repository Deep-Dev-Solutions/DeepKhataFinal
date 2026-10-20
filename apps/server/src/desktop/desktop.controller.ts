import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { Role } from '@prisma/client';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { SyncPullService } from '../sync/sync-pull.service';
import { SyncPullQueryDto } from '../sync/dto/sync-pull.dto';
import { DeviceAuth, DeviceAuthGuard, hashDeviceToken } from './device-auth.guard';
import { DesktopPushService } from './desktop-push.service';
import { CreateDeviceDto, DesktopPushDto } from './dto/desktop.dto';
import { LicenceService } from './licence.service';

/** Owner-managed shop PCs (cloud). The token is shown once and only its hash is stored. */
@Controller('desktop/devices')
@UseGuards(ThrottlerGuard, SessionGuard, RolesGuard)
@Roles(Role.OWNER)
export class DesktopDevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async create(@Tenant() t: TenantContext, @Body() dto: CreateDeviceDto) {
    const deviceToken = randomBytes(32).toString('base64url');
    const device = await this.prisma.device.create({
      data: {
        businessId: t.businessId,
        name: dto.name.trim(),
        tokenHash: hashDeviceToken(deviceToken),
      },
      select: { id: true },
    });
    return { deviceId: device.id, deviceToken };
  }

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.prisma.device.findMany({
      where: { businessId: t.businessId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/revoke')
  async revoke(@Tenant() t: TenantContext, @Param('id') id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, businessId: t.businessId },
      select: { id: true, revokedAt: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    const revokedAt = device.revokedAt ?? new Date();
    if (!device.revokedAt) {
      await this.prisma.device.update({ where: { id }, data: { revokedAt } });
    }
    return { id, revokedAt };
  }
}

/** Endpoints the shop PC calls with `Authorization: Device <deviceToken>`. */
@Controller()
@UseGuards(ThrottlerGuard, DeviceAuthGuard)
export class DesktopDeviceApiController {
  constructor(
    private readonly licences: LicenceService,
    private readonly push: DesktopPushService,
    private readonly pull: SyncPullService,
  ) {}

  @Post('desktop/licence')
  async licence(@Req() req: { device: DeviceAuth }) {
    const { token } = await this.licences.issue(req.device.businessId, req.device.id);
    return { token };
  }

  @Post('sync/desktop/push')
  async pushEvents(@Req() req: { device: DeviceAuth }, @Body() dto: DesktopPushDto) {
    if (dto.deviceId !== req.device.id) {
      throw new ForbiddenException('deviceId does not match the device token');
    }
    return this.push.push(req.device.businessId, dto.events);
  }

  /** Same data as GET /sync/pull, authenticated by device token instead of a session. */
  @Get('sync/desktop/pull')
  async pullData(@Req() req: { device: DeviceAuth }, @Query() query: SyncPullQueryDto) {
    const userId = await this.push.actingUserId(req.device.businessId);
    if (!userId) throw new ForbiddenException('Business has no active owner');
    return this.pull.pull(
      { businessId: req.device.businessId, branchId: null, userId, role: Role.OWNER },
      query,
    );
  }
}
