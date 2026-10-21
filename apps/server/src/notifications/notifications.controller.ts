import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsQueryDto,
  MarkReadDto,
  UpdateNotificationSettingsDto,
} from './dto/notification.dto';

@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('notifications')
  @RequirePermissions('read:notifications')
  list(
    @Tenant() tenant: TenantContext,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.service.list(
      tenant.businessId,
      tenant.userId,
      query.limit ?? 20,
      query.cursor,
    );
  }

  @Post('notifications/read')
  @RequirePermissions('read:notifications')
  markRead(@Tenant() tenant: TenantContext, @Body() body: MarkReadDto) {
    return this.service.markRead(
      tenant.businessId,
      tenant.userId,
      body.ids,
      body.all,
    );
  }

  @Get('notification-settings')
  @RequirePermissions('read:notifications')
  getSettings(@Tenant() tenant: TenantContext) {
    return this.service.getEffectiveSettings(tenant.businessId);
  }

  @Put('notification-settings')
  @RequirePermissions('manage:notification-settings')
  updateSettings(
    @Tenant() tenant: TenantContext,
    @Body() body: UpdateNotificationSettingsDto,
  ) {
    return this.service.updateSettings(tenant.businessId, body);
  }
}
