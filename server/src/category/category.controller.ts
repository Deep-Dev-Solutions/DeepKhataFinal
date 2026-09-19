import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('category')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getCategories(@Req() req: any) {
    return this.categoryService.getCategories(req.user.id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCategory(@Req() req: any, @Body() body: any) {
    return this.categoryService.addCategory(req.user.id, body);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.categoryService.updateCategory(req.user.id, id, body);
  }

  @Post(':id/delete')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('write:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.categoryService.deleteCategory(req.user.id, id);
  }
}