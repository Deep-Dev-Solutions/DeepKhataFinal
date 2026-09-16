import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  create(@Request() req, @Body() data: any) {
    return this.workOrdersService.createWorkOrder(req.user.id, data);
  }

  @Get()
  findAll(@Request() req) {
    return this.workOrdersService.getWorkOrders(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.workOrdersService.getWorkOrderById(req.user.id, id);
  }

  @Post(':id/parts')
  addPart(@Request() req, @Param('id') id: string, @Body() data: any) {
    return this.workOrdersService.addPart(req.user.id, id, data);
  }

  @Patch(':id/status')
  updateStatus(@Request() req, @Param('id') id: string, @Body() data: any) {
    return this.workOrdersService.updateStatus(req.user.id, id, data);
  }
}
