import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Param,
  Put,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('order')
@UseGuards(ThrottlerGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('neworder')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create:order')
  async newOrder(@Req() req: any, @Body() body: any) {
    return this.ordersService.newOrder(req.user.id, body);
  }

  @Get('getallorders')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('read:orders')
  async getAllOrders(@Req() req: any, @Query() query: any) {
    return this.ordersService.getAllOrders(req.user.id, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('read:orders')
  async getOrderById(@Req() req: any, @Param('id') id: string) {
    return this.ordersService.getOrderById(req.user.id, id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('update:order')
  async updateOrderStatusPatch(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.ordersService.updateOrderStatus(req.user.id, id, body);
  }

  @Put('updatestatus/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('update:order')
  async updateOrderStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.ordersService.updateOrderStatus(req.user.id, id, body);
  }

  @Patch(':id/settle-memo')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('update:order')
  async settleMemo(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.ordersService.settleMemo(req.user.id, id, body);
  }

  @Post('recordpayment')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('update:order')
  async recordPaymentRoute(@Req() req: any, @Body() body: any) {
    return this.ordersService.recordPayment(req.user.id, body);
  }

  @Post('payment')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('update:order')
  async recordPayment(@Req() req: any, @Body() body: any) {
    return this.ordersService.recordPayment(req.user.id, body);
  }

  @Get('public/invoice/:id')
  async getPublicInvoice(@Param('id') id: string) {
    return this.ordersService.getPublicInvoice(id);
  }

  @Post(':id/return')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @RequirePermissions('update:order')
  async processReturn(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.ordersService.processReturn(req.user.id, id, body);
  }
}
