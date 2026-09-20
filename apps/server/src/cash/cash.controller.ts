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
import { ThrottlerGuard } from '@nestjs/throttler';
import { LogExpenseDto } from './dto/log-expense.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';

@Controller('cash')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  /**
   * Log daily operational cash expense
   */
  @Post('expense')
  async logExpense(@Req() req: any, @Body() dto: LogExpenseDto) {
    return this.cashService.logExpense(req.user.id, dto);
  }

  /**
   * List recent expenses
   */
  @Get('expenses')
  async getExpenses(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.cashService.getExpenses(req.user.id, { date, branchId, limit });
  }

  /**
   * Get current register status & expected cash
   */
  @Get('register/status')
  async getRegisterStatus(@Req() req: any, @Query('branchId') branchId?: string) {
    return this.cashService.getRegisterStatus(req.user.id, branchId);
  }

  /**
   * Open register session
   */
  @Post('register/open')
  async openRegister(@Req() req: any, @Body() dto: OpenRegisterDto) {
    return this.cashService.openRegister(req.user.id, dto);
  }

  /**
   * Close register session and reconcile
   */
  @Post('register/close')
  async closeRegister(@Req() req: any, @Body() dto: CloseRegisterDto) {
    return this.cashService.closeRegister(req.user.id, dto);
  }

  /**
   * Generate End of Day Z-Report
   */
  @Get('register/z-report')
  async getZReport(@Req() req: any, @Query('sessionId') sessionId?: string) {
    return this.cashService.getZReport(req.user.id, sessionId);
  }

  /**
   * Get recent register sessions history
   */
  @Get('register/sessions')
  async getSessions(@Req() req: any, @Query('limit') limit?: number) {
    return this.cashService.getRecentSessions(req.user.id, limit);
  }
}
