import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AgencyService } from './agency.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AccessLogAction } from '../analytics/access-log.decorator';
import {
  SignupsQueryDto,
  TasksQueryDto,
  UpdateSignupDto,
  UpdateTaskDto,
} from '../lifecycle/dto/agency-signups.dto';

@UseGuards(SessionGuard, RolesGuard)
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

  @Get('tenants/:id')
  async getTenantById(@Param('id') id: string) {
    return this.agencyService.getTenantById(id);
  }

  /** Read-only support session as the tenant's owner; 1 h; logged as VIEW_AS. */
  @Post('tenants/:id/view-as')
  @AccessLogAction('VIEW_AS')
  async viewAsTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.agencyService.createViewAsSession(id, req.user.id);
  }

  @Patch('tenants/:id/status')
  async updateTenantStatus(@Param('id') id: string, @Body() data: any) {
    return this.agencyService.updateTenantStatus(id, data?.status);
  }

  @Post('tenants/:id/billing')
  async logPaymentAndExtend(@Param('id') id: string, @Body() data: any) {
    return this.agencyService.logPaymentAndExtend(id, data);
  }

  @Post('branch/:businessId')
  async addBranchToTenant(
    @Param('businessId') businessId: string,
    @Body() data: any,
  ) {
    return this.agencyService.addBranchToTenant(businessId, data);
  }

  @Get('signups')
  async getSignups(@Query() query: SignupsQueryDto) {
    return this.agencyService.getSignups(query);
  }

  @Patch('signups/:businessId')
  async updateSignup(
    @Param('businessId') businessId: string,
    @Body() body: UpdateSignupDto,
  ) {
    return this.agencyService.updateSignup(businessId, body);
  }

  @Get('tasks')
  async getTasks(@Query() query: TasksQueryDto) {
    return this.agencyService.getTasks(query);
  }

  @Patch('tasks/:id')
  async updateTask(@Param('id') id: string, @Body() body: UpdateTaskDto) {
    return this.agencyService.completeTask(id, body);
  }
}
