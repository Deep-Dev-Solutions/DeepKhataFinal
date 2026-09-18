import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AgencyService } from './agency.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('agency')
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  @Post('onboard-tenant')
  async onboardTenant(@Body() data: any) {
    return this.agencyService.onboardTenant(data);
  }

  @Get('tenants')
  async getTenants() {
    return this.agencyService.getTenants();
  }
}
