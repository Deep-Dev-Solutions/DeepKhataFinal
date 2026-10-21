import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import {
  CreateTransferDto,
  ListTransfersQueryDto,
} from './stock-transfers.dto';
import { StockTransfersService } from './stock-transfers.service';

@Controller('stock-transfers')
@UseGuards(SessionGuard, PermissionsGuard)
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Post()
  @RequirePermissions('request:transfers')
  create(@Tenant() t: TenantContext, @Body() dto: CreateTransferDto) {
    return this.transfers.create(t, dto);
  }

  @Post(':id/dispatch')
  @RequirePermissions('manage:transfers')
  dispatch(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.dispatch(t, id);
  }

  @Post(':id/receive')
  @RequirePermissions('manage:transfers')
  receive(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.receive(t, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('request:transfers')
  cancel(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.cancel(t, id);
  }

  @Get()
  @RequirePermissions('read:stock-finder')
  list(@Tenant() t: TenantContext, @Query() query: ListTransfersQueryDto) {
    return this.transfers.list(t, query);
  }

  @Get(':id')
  @RequirePermissions('read:stock-finder')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(t, id);
  }
}
