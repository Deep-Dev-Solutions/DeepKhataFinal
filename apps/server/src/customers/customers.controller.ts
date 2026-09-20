import {
  Controller,
  Post,
  Body,
  Put,
  Param,
  Patch,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('customer')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('newcustomer')
  @RequirePermissions('write:customers')
  async newCustomer(@Req() req: any, @Body() body: any) {
    return this.customersService.newCustomer(req.user.id, body);
  }

  @Put('customerdetails/:id')
  @RequirePermissions('write:customers')
  async customerDetails(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.customersService.customerDetails(req.user.id, id, body);
  }

  @Patch('customerrisk/:id')
  @RequirePermissions('manage:risk')
  async customerRisk(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.customersService.customerRisk(req.user.id, id, body);
  }

  @Get('getallcustomers')
  @RequirePermissions('read:customers')
  async getAllCustomers(@Req() req: any, @Query() query: any) {
    return this.customersService.getAllCustomers(req.user.id, query);
  }

  @Get(':id/ledger')
  @RequirePermissions('read:customers')
  async getCustomerLedger(@Req() req: any, @Param('id') id: string) {
    return this.customersService.getCustomerLedger(req.user.id, id);
  }

  @Get(':id')
  @RequirePermissions('read:customers')
  async getCustomerById(@Req() req: any, @Param('id') id: string) {
    return this.customersService.getCustomerById(req.user.id, id);
  }
}
