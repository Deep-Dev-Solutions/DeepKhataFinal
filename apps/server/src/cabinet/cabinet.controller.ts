import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CabinetService } from './cabinet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BranchId } from '../auth/decorators/branch-id.decorator';

@Controller('cabinet')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class CabinetController {
  constructor(private readonly cabinetService: CabinetService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getCabinets(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query() query: any,
  ) {
    return this.cabinetService.getCabinets(req.user.id, {
      ...query,
      branchId,
    });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCabinet(
    @Req() req: any,
    @BranchId({ required: false }) branchId: string | undefined,
    @Body() body: any,
  ) {
    return this.cabinetService.addCabinet(req.user.id, {
      ...body,
      branchId: body.branchId || branchId,
    });
  }

  @Patch('debug-reorder')
  async debugReorder() {
    return { success: true };
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async updateCabinet(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.cabinetService.updateCabinet(req.user.id, id, body);
  }

  @Post(':id/delete')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('write:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteCabinet(@Req() req: any, @Param('id') id: string) {
    return this.cabinetService.deleteCabinet(req.user.id, id);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('write:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteCabinetHttp(@Req() req: any, @Param('id') id: string) {
    return this.cabinetService.deleteCabinet(req.user.id, id);
  }
}
