import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CategoryService } from '../category/category.service';
import { CabinetService } from '../cabinet/cabinet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdatePriceDto } from './dto/update-price.dto';

@Controller('product')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoryService: CategoryService,
    private readonly cabinetService: CabinetService,
  ) {}

  @Post('addcategory')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCategory(@Req() req: any, @Body() body: any) {
    return this.categoryService.addCategory(req.user.id, body);
  }

  @Post('addproduct')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addProduct(@Req() req: any, @Body() body: CreateProductDto) {
    return this.productsService.addProduct(req.user.id, body);
  }

  @Get('getproducts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getProducts(@Req() req: any, @Query() query: any) {
    return this.productsService.getProducts(req.user.id, query);
  }

  @Get('getcategories')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getCategories(@Req() req: any) {
    return this.categoryService.getCategories(req.user.id);
  }

  @Get('getcabinets')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getCabinets(@Req() req: any, @Query() query: any) {
    return this.cabinetService.getCabinets(req.user.id, query);
  }

  @Post('addcabinet')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCabinet(@Req() req: any, @Body() body: any) {
    return this.cabinetService.addCabinet(req.user.id, body);
  }

  @Patch('category/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.categoryService.updateCategory(req.user.id, id, body);
  }

  @Patch('cabinet/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async updateCabinet(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.cabinetService.updateCabinet(req.user.id, id, body);
  }

  @Post('category/:id/delete')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('write:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.categoryService.deleteCategory(req.user.id, id);
  }

  @Post('cabinet/:id/delete')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('write:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteCabinet(@Req() req: any, @Param('id') id: string) {
    return this.cabinetService.deleteCabinet(req.user.id, id);
  }

  @Get('getbranches')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getBranches(@Req() req: any) {
    return this.productsService.getBranches(req.user.id);
  }

  @Post('bulk-restock')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async bulkRestock(@Req() req: any, @Body() body: any) {
    return this.productsService.bulkRestock(req.user.id, body);
  }

  @Post('import')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async importProducts(@Req() req: any, @Body() body: any) {
    return this.productsService.importProducts(req.user.id, body.products);
  }

  @Patch('updateprice/:id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('write:products')
  async updatePrice(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdatePriceDto,
  ) {
    return this.productsService.updatePrice(req.user.id, id, body.price);
  }

  @Post('move-stock')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async moveStock(
    @Req() req: any,
    @Body() body: { productId: string; targetBranchId?: string },
  ) {
    return this.productsService.moveStockFromDeletedBranches(
      req.user.id,
      body.productId,
      body.targetBranchId,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermissions('delete:products')
  @Roles(Role.OWNER, Role.SUPER_ADMIN)
  async deleteProduct(@Req() req: any, @Param('id') id: string) {
    return this.productsService.deleteProduct(req.user.id, id);
  }
}