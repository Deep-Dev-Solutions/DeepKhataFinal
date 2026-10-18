import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { DuesService, DueEntityType, ENTITY_TYPES } from './dues.service';
import {
  ListDuesQueryDto,
  PromiseDto,
  RemindedDto,
  WhatsappLinkQueryDto,
} from './dto/dues.dto';

function parseEntityType(raw: string): DueEntityType {
  if (!(ENTITY_TYPES as readonly string[]).includes(raw)) {
    throw new BadRequestException('Unknown entity type');
  }
  return raw as DueEntityType;
}

@Controller('dues')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @Get('summary')
  @RequirePermissions('read:dues')
  summary(@Tenant() t: TenantContext) {
    return this.dues.summary(t.businessId);
  }

  @Get()
  @RequirePermissions('read:dues')
  list(@Tenant() t: TenantContext, @Query() q: ListDuesQueryDto) {
    return this.dues.list(t.businessId, q);
  }

  @Post(':entityType/:entityId/promise')
  @RequirePermissions('manage:dues')
  async promise(
    @Tenant() t: TenantContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() dto: PromiseDto,
  ) {
    const type = parseEntityType(entityType);
    return this.dues.addPromise(t.businessId, t.userId, type, entityId, dto);
  }

  @Post(':entityType/:entityId/reminded')
  @RequirePermissions('manage:dues')
  async reminded(
    @Tenant() t: TenantContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() dto: RemindedDto,
  ) {
    const type = parseEntityType(entityType);
    return this.dues.logReminder(
      t.businessId,
      t.userId,
      type,
      entityId,
      dto.channel ?? 'WHATSAPP_LINK',
    );
  }

  @Get(':entityType/:entityId/whatsapp-link')
  @RequirePermissions('read:dues')
  async whatsappLink(
    @Tenant() t: TenantContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() q: WhatsappLinkQueryDto,
  ) {
    const type = parseEntityType(entityType);
    return this.dues.whatsappLink(t.businessId, type, entityId, q.lang ?? 'ur');
  }
}
