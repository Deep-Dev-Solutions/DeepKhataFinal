import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { KhataDirection, KhataStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { KhataEntriesService } from './khata-entries.service';
import {
  CreateKhataEntryDto,
  PromoteKhataEntryDto,
  SettleKhataEntryDto,
  UpdateKhataEntryDto,
  WriteOffKhataEntryDto,
} from './dto/khata-entry.dto';

class ListKhataEntriesQuery {
  @IsOptional()
  @IsEnum(KhataDirection)
  direction?: KhataDirection;

  @IsOptional()
  @IsEnum(KhataStatus)
  status?: KhataStatus;
}

@Controller('khata-entries')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class KhataEntriesController {
  constructor(private readonly service: KhataEntriesService) {}

  @Post()
  @RequirePermissions('manage:dues')
  create(@Tenant() t: TenantContext, @Body() dto: CreateKhataEntryDto) {
    return this.service.create(t, dto);
  }

  @Get()
  @RequirePermissions('read:dues')
  list(@Tenant() t: TenantContext, @Query() q: ListKhataEntriesQuery) {
    return this.service.list(t.businessId, q.direction, q.status);
  }

  @Get(':id')
  @RequirePermissions('read:dues')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.getWithTransactions(t.businessId, id);
  }

  @Patch(':id')
  @RequirePermissions('manage:dues')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateKhataEntryDto,
  ) {
    return this.service.update(t.businessId, id, dto);
  }

  @Post(':id/settle')
  @RequirePermissions('manage:dues')
  settle(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body() dto: SettleKhataEntryDto,
  ) {
    return this.service.settle(t, id, dto);
  }

  @Post(':id/write-off')
  @RequirePermissions('write-off:dues')
  writeOff(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body() dto: WriteOffKhataEntryDto,
  ) {
    return this.service.writeOff(t, id, dto);
  }

  @Post(':id/promote')
  @RequirePermissions('manage:dues')
  promote(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body() dto: PromoteKhataEntryDto,
  ) {
    return this.service.promote(t, id, dto);
  }
}
