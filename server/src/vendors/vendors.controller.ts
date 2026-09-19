import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { VendorsService } from './vendors.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  createVendor(@Req() req: any, @Body() data: any) {
    return this.vendorsService.createVendor(req.user.id, data);
  }

  @Get()
  getAllVendors(@Req() req: any, @Query() query: any) {
    return this.vendorsService.getAllVendors(req.user.id, query);
  }

  @Get(':id')
  getVendorById(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.getVendorById(req.user.id, id);
  }

  @Post(':id/purchase')
  recordPurchase(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.vendorsService.recordPurchase(req.user.id, id, data);
  }

  @Post(':id/payment')
  recordPayment(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.vendorsService.recordPayment(req.user.id, id, data);
  }
}
