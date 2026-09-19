import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  private async requireBusinessId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );
    return user.businessId;
  }

  async getCategories(userId: string) {
    const businessId = await this.requireBusinessId(userId);

    const categories = await this.prisma.category.findMany({
      where: { businessId },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, categories };
  }

  async addCategory(userId: string, data: any) {
    const businessId = await this.requireBusinessId(userId);

    const name = data?.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');

    const existing = await this.prisma.category.findFirst({
      where: { businessId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Category already exists');

    const category = await this.prisma.category.create({
      data: { name, businessId },
    });

    return { success: true, message: 'Category created successfully', category };
  }

  async updateCategory(userId: string, id: string, data: any) {
    const businessId = await this.requireBusinessId(userId);

    const category = await this.prisma.category.findFirst({
      where: { id, businessId },
    });
    if (!category) throw new BadRequestException('Category not found');

    const name = data?.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');

    const duplicate = await this.prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: name, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (duplicate) throw new ConflictException('Category already exists');

    const updated = await this.prisma.category.update({
      where: { id },
      data: { name },
    });

    return {
      success: true,
      message: 'Category updated successfully',
      category: updated,
    };
  }

  async deleteCategory(userId: string, id: string) {
    const businessId = await this.requireBusinessId(userId);

    const category = await this.prisma.category.findFirst({
      where: { id, businessId },
    });
    if (!category) throw new BadRequestException('Category not found');

    await this.prisma.$transaction(async (tx) => {
      // Unassign products to the business 'General' category (category is mandatory on products).
      let general = await tx.category.findFirst({
        where: { businessId, name: 'General' },
      });
      if (!general) {
        general = await tx.category.create({
          data: { name: 'General', businessId },
        });
      }
      await tx.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: general.id },
      });
      await tx.category.delete({ where: { id } });
    });

    return { success: true, message: 'Category deleted successfully' };
  }
}