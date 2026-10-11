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
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import {
  CreateReservationDto,
  ListReservationsQueryDto,
} from './reservations.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @RequirePermissions('manage:reservations')
  create(@Tenant() t: TenantContext, @Body() dto: CreateReservationDto) {
    return this.reservations.create(t, dto);
  }

  @Post(':id/release')
  @RequirePermissions('manage:reservations')
  release(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.release(t, id);
  }

  @Get()
  @RequirePermissions('read:stock-finder')
  list(@Tenant() t: TenantContext, @Query() query: ListReservationsQueryDto) {
    return this.reservations.list(t, query.status);
  }
}
