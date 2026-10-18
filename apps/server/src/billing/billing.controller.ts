import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BillingService } from './billing.service';
import {
  CreateInvoiceDto,
  ListInvoicesQueryDto,
  ListPaymentsQueryDto,
  RecordPaymentDto,
} from './billing.dto';

function sendPdf(res: Response, file: { filename: string; buffer: Buffer }): StreamableFile {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(file.buffer);
}

/** SUPER_ADMIN acting on a tenant: businessId comes from the body/param and is validated to exist. */
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('agency/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billing.createInvoice(dto);
  }

  @Get('invoices')
  listInvoices(@Query() q: ListInvoicesQueryDto) {
    return this.billing.list(q);
  }

  @Get('invoices/:id')
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.get(id);
  }

  @Get('invoices/:id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendPdf(res, await this.billing.pdfForId(id));
  }

  @Post('invoices/:id/send')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.send(id);
  }

  @Post('invoices/:id/void')
  voidInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.voidInvoice(id);
  }

  @Post('invoices/:id/payments')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.billing.recordPayment(id, dto, req.user?.id ?? null);
  }

  @Get('payments')
  listPayments(@Query() q: ListPaymentsQueryDto) {
    return this.billing.listPayments(q.businessId);
  }
}

/** Unauthenticated: the unguessable token is the only credential and resolves exactly one invoice. */
@UseGuards(ThrottlerGuard)
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(private readonly billing: BillingService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.billing.publicInvoice(token);
  }

  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    if (!token) throw new NotFoundException('Invoice not found');
    return sendPdf(res, await this.billing.publicPdf(token));
  }
}
