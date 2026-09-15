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
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('product')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('addcategory')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCategory(@Req() req: any, @Body() body: any) {
    return this.productsService.addCategory(req.user.id, body);
  }

  @Post('addproduct')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addProduct(@Req() req: any, @Body() body: any) {
    return this.productsService.addProduct(req.user.id, body);
  }

  @Get('getproducts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('read:products')
  async getProducts(@Req() req: any, @Query() query: any) {
    return this.productsService.getProducts(req.user.id, query);
  }

  @Get('getcategories')
  async getCategories(@Req() req: any) {
    return this.productsService.getCategories(req.user.id);
  }

  @Get('getcabinets')
  async getCabinets(@Req() req: any) {
    return this.productsService.getCabinets(req.user.id);
  }

  @Post('addcabinet')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addCabinet(@Req() req: any, @Body() body: any) {
    return this.productsService.addCabinet(req.user.id, body);
  }

  @Get('getbranches')
  async getBranches(@Req() req: any) {
    return this.productsService.getBranches(req.user.id);
  }

  @Post('addbranch')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async addBranch(@Req() req: any, @Body() body: any) {
    return this.productsService.addBranch(req.user.id, body);
  }

  @Post('bulk-restock')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('write:products')
  async bulkRestock(@Req() req: any, @Body() body: any) {
    return this.productsService.bulkRestock(req.user.id, body);
  }

  @Patch('updateprice/:id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('write:products')
  async updatePrice(
    @Req() req: any,
    @Param('id') id: string,
    @Body('price') price: number,
  ) {
    return this.productsService.updatePrice(req.user.id, id, price);
  }
}
