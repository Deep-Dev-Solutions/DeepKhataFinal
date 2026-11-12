import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
  GoneException,
} from '@nestjs/common';
import { VendorsService } from './vendors.service.js';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { OpeningBalanceDto } from './dto/opening-balance.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';

@UseGuards(SessionGuard, PermissionsGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @RequirePermissions('manage:vendors')
  createVendor(@Req() req: any, @Body() data: any) {
    return this.vendorsService.createVendor(req.user.id, data);
  }

  @Get()
  @RequirePermissions('read:vendors')
  getAllVendors(@Req() req: any, @Query() query: any) {
    return this.vendorsService.getAllVendors(req.user.id, query);
  }

  @Get(':id')
  @RequirePermissions('read:vendors')
  getVendorById(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.getVendorById(req.user.id, id);
  }

  @Post(':id/purchase')
  @RequirePermissions('manage:vendors')
  recordPurchase(): never {
    throw new GoneException(
      'Purchases are recorded automatically from Add Product and Restock Hub. Use "Purani udhar add karein" for an opening balance.',
    );
  }

  @Post(':id/opening-balance')
  @RequirePermissions('manage:vendors')
  recordOpeningBalance(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: OpeningBalanceDto,
  ) {
    return this.vendorsService.recordOpeningBalance(req.user.id, id, data);
  }

  @Post(':id/payment')
  @RequirePermissions('manage:vendors')
  recordPayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: RecordPaymentDto,
  ) {
    return this.vendorsService.recordPayment(req.user.id, id, data);
  }

  @Post(':id/transactions/:txId/void')
  @RequirePermissions('manage:vendors')
  voidTransaction(
    @Req() req: any,
    @Param('id') id: string,
    @Param('txId') txId: string,
    @Body() data: VoidTransactionDto,
  ) {
    return this.vendorsService.voidTransaction(req.user.id, id, txId, data);
  }
}
