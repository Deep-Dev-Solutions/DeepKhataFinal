import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SyncModule } from '../sync/sync.module';
import { TenantModule } from '../tenant/tenant.module';
import { DeviceAuthGuard } from './device-auth.guard';
import { DesktopPushService } from './desktop-push.service';
import {
  DesktopDeviceApiController,
  DesktopDevicesController,
} from './desktop.controller';
import { LicenceService } from './licence.service';
import { installOutbox } from './outbox.extension';
import { OutboxService } from './outbox.service';

@Module({
  imports: [PrismaModule, SyncModule, TenantModule],
  controllers: [DesktopDevicesController, DesktopDeviceApiController],
  providers: [DeviceAuthGuard, DesktopPushService, LicenceService, OutboxService],
  exports: [OutboxService],
})
export class DesktopModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // No-op unless DEPLOYMENT_MODE=desktop.
    installOutbox(this.prisma);
  }
}
