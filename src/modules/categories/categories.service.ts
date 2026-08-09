import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CategoryProductsQueryDto,
  ProductSortEnum,
} from './dto/category-products-query.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /categories
   * Get all active categories (flat list)
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      categories,
    };
  }

  /**
   * GET /categories/tree
   * Get category tree hierarchy (root categories with children)
   */
  async getCategoryTree() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null, parentId: null },
      include: {
        children: {
          where: { isActive: true, deletedAt: null },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      categories,
    };
  }

  /**
   * GET /categories/:id
   * Get category details by ID or Slug
   */
  async getCategoryById(id: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    const category = await this.prisma.category.findFirst({
      where: isUuid
        ? { id, isActive: true, deletedAt: null }
        : { slug: id, isActive: true, deletedAt: null },
      include: {
        children: { where: { isActive: true, deletedAt: null } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      success: true,
      category,
    };
  }

  /**
   * GET /categories/:id/products
   * Get paginated products for a category (by ID or Slug)
   */
  async getCategoryProducts(
    id: string,
    query: CategoryProductsQueryDto,
  ) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    const category = await this.prisma.category.findFirst({
      where: isUuid
        ? { id, isActive: true, deletedAt: null }
        : { slug: id, isActive: true, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      categoryId: category.id,
      deletedAt: null,
      status: 'ACTIVE',
      ...(query.priceMin !== undefined || query.priceMax !== undefined
        ? {
            price: {
              ...(query.priceMin !== undefined && { gte: query.priceMin }),
              ...(query.priceMax !== undefined && { lte: query.priceMax }),
            },
          }
        : {}),
      ...(query.inStock ? { stock: { gt: 0 } } : {}),
      ...(query.brand ? { brand: { contains: query.brand, mode: 'insensitive' } } : {}),
      ...(query.petSpecies ? { petSpecies: query.petSpecies.toUpperCase() as any } : {}),
      ...(query.diet ? { dietaryPreference: query.diet.toUpperCase() as any } : {}),
    };

    let orderByCondition: any = { createdAt: 'desc' };
    if (query.sort === ProductSortEnum.POPULARITY) {
      orderByCondition = { reviewsCount: 'desc' };
    } else if (query.sort === ProductSortEnum.PRICE_ASC) {
      orderByCondition = { price: 'asc' };
    } else if (query.sort === ProductSortEnum.PRICE_DESC) {
      orderByCondition = { price: 'desc' };
    } else if (query.sort === ProductSortEnum.RATING) {
      orderByCondition = { rating: 'desc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereCondition,
        orderBy: orderByCondition,
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where: whereCondition }),
    ]);

    return {
      success: true,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      products,
    };
  }
}
