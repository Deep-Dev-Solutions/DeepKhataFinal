import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { RemindersService } from './reminders.service';
import { RunRemindersDto } from './dto/run-reminders.dto';

@Controller('reminders')
@UseGuards(SessionGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /** Test-only: runs the reminder evaluation at a given clock time. */
  @Post('run')
  @Roles(Role.OWNER)
  async run(@Tenant() t: TenantContext, @Body() body: RunRemindersDto) {
    if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
      throw new NotFoundException();
    }
    const now = body.now ? new Date(body.now) : new Date();
    const fired = await this.reminders.runForBusiness(t.businessId, now);
    return { fired };
  }
}
