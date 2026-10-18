import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CashService } from './cash.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LogExpenseDto } from './dto/log-expense.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { BranchId } from '../auth/decorators/branch-id.decorator';

@Controller('cash')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post('expense')
  @RequirePermissions('manage:cash')
  async logExpense(
    @Req() req: any,
    @BranchId({ required: false }) branchId: string | undefined,
    @Body() dto: LogExpenseDto,
  ) {
    return this.cashService.logExpense(req.user.id, {
      ...dto,
      branchId: dto.branchId || branchId,
    });
  }

  @Get('expenses')
  @RequirePermissions('read:cash')
  async getExpenses(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query('date') date?: string,
    @Query('limit') limit?: number,
  ) {
    return this.cashService.getExpenses(req.user.id, {
      date,
      branchId,
      limit,
    });
  }

  @Get('register/status')
  @RequirePermissions('read:cash')
  async getRegisterStatus(
    @Req() req: any,
    @BranchId() branchId: string,
  ) {
    return this.cashService.getRegisterStatus(req.user.id, branchId);
  }

  @Post('register/open')
  @RequirePermissions('manage:cash')
  async openRegister(
    @Req() req: any,
    @BranchId({ required: false }) branchId: string | undefined,
    @Body() dto: OpenRegisterDto,
  ) {
    return this.cashService.openRegister(req.user.id, {
      ...dto,
      branchId: dto.branchId || branchId,
    });
  }

  @Post('register/close')
  @RequirePermissions('manage:cash')
  async closeRegister(@Req() req: any, @Body() dto: CloseRegisterDto) {
    return this.cashService.closeRegister(req.user.id, dto);
  }

  @Get('register/z-report')
  @RequirePermissions('read:cash')
  async getZReport(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.cashService.getZReport(req.user.id, branchId, sessionId);
  }

  @Get('register/sessions')
  @RequirePermissions('read:cash')
  async getSessions(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query('limit') limit?: number,
  ) {
    return this.cashService.getRecentSessions(req.user.id, branchId, limit);
  }
}
