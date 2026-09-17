import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('inventory')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('restock')
  @RequirePermissions('write:products')
  async restock(@Req() req: any, @Body() body: any) {
    return this.inventoryService.restock(req.user.id, body);
  }

  @Get('movements')
  @RequirePermissions('read:products')
  async getMovements(@Req() req: any, @Query() query: any) {
    return this.inventoryService.getMovements(req.user.id, query);
  }
}