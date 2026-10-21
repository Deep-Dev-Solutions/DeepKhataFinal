import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { StockFindQueryDto } from './stock-finder.dto';
import { StockFinderService } from './stock-finder.service';

@Controller('stock')
@UseGuards(SessionGuard, PermissionsGuard)
export class StockFinderController {
  constructor(private readonly stockFinder: StockFinderService) {}

  @Get('find')
  @RequirePermissions('read:stock-finder')
  find(@Tenant() t: TenantContext, @Query() query: StockFindQueryDto) {
    return this.stockFinder.find(t, query.q ?? '', query.limit ?? 20);
  }
}
