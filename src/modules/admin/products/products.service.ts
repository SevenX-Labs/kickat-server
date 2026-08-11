import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminProductSortEnum,
  AdminProductsQueryDto,
  BulkProductDeleteDto,
  BulkProductStatusDto,
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateProductStockDto,
} from './dto/admin-product.dto';
import { ProductStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to generate a URL-safe kebab-case slug
   */
  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Helper to ensure unique slug for product
   */
  private async ensureUniqueSlug(
    baseSlug: string,
    excludeProductId?: string,
  ): Promise<string> {
    let slug = this.generateSlug(baseSlug);
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || (excludeProductId && existing.id === excludeProductId)) {
        return slug;
      }

      slug = `${this.generateSlug(baseSlug)}-${counter}`;
      counter++;
    }
  }

  /**
   * GET /api/v1/admin/products
   * List all products with advanced search, filters, sorting, pagination, and inventory summary
   */
  async getProducts(query: AdminProductsQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;
    const threshold = query.lowStockThreshold || 10;

    const where: any = {
      deletedAt: null,
    };

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { brand: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        {
          variants: {
            some: {
              OR: [
                { name: { contains: s, mode: 'insensitive' } },
                { sku: { contains: s, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.petSpecies) {
      where.petSpecies = query.petSpecies;
    }

    if (query.dietaryPreference) {
      where.dietaryPreference = query.dietaryPreference;
    }

    if (query.brand) {
      where.brand = { contains: query.brand.trim(), mode: 'insensitive' };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined && { gte: query.minPrice }),
        ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
      };
    }

    if (query.inStock !== undefined) {
      where.stock = query.inStock ? { gt: 0 } : 0;
    }

    if (query.isLowStock) {
      where.stock = { gt: 0, lte: threshold };
    }

    if (query.isTrending !== undefined) {
      where.isTrending = query.isTrending;
    }

    if (query.isBestSeller !== undefined) {
      where.isBestSeller = query.isBestSeller;
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminProductSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminProductSortEnum.PRICE_ASC:
        orderBy = { price: 'asc' };
        break;
      case AdminProductSortEnum.PRICE_DESC:
        orderBy = { price: 'desc' };
        break;
      case AdminProductSortEnum.NAME_ASC:
        orderBy = { name: 'asc' };
        break;
      case AdminProductSortEnum.NAME_DESC:
        orderBy = { name: 'desc' };
        break;
      case AdminProductSortEnum.STOCK_ASC:
        orderBy = { stock: 'asc' };
        break;
      case AdminProductSortEnum.STOCK_DESC:
        orderBy = { stock: 'desc' };
        break;
      case AdminProductSortEnum.RATING_DESC:
        orderBy = { rating: 'desc' };
        break;
      case AdminProductSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [
      products,
      total,
      activeCount,
      draftCount,
      inactiveCount,
      lowStockCount,
      outOfStockCount,
    ] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              stock: true,
              attributes: true,
              imageUrl: true,
            },
          },
          media: {
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              reviews: true,
              variants: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatusEnum.ACTIVE } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatusEnum.DRAFT } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatusEnum.INACTIVE } }),
      this.prisma.product.count({
        where: { deletedAt: null, stock: { gt: 0, lte: threshold } },
      }),
      this.prisma.product.count({ where: { deletedAt: null, stock: 0 } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        products,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalProducts: total,
          activeCount,
          draftCount,
          inactiveCount,
          lowStockCount,
          outOfStockCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/products/:id
   * Get complete product details by ID or Slug
   */
  async getProductById(idOrSlug: string) {
    const isUuid = UUID_V4_REGEX.test(idOrSlug);

    const product = await this.prisma.product.findFirst({
      where: {
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
        deletedAt: null,
      },
      include: {
        category: true,
        variants: {
          orderBy: { createdAt: 'asc' },
        },
        media: {
          orderBy: { order: 'asc' },
        },
        reviews: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            reviews: true,
            variants: true,
            wishlistItems: true,
            cartItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      success: true,
      data: product,
    };
  }

  /**
   * POST /api/v1/admin/products
   * Create a new product with variants and media
   */
  async createProduct(dto: CreateProductDto) {
    // 1. Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException('Invalid categoryId: Category not found');
    }

    // 2. Generate unique slug
    const slug = await this.ensureUniqueSlug(dto.slug || dto.name);

    // 3. Create product in transaction
    const createdProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description || null,
          price: dto.price,
          discountPrice: dto.discountPrice || null,
          stock: dto.stock ?? 0,
          brand: dto.brand || null,
          petSpecies: dto.petSpecies || null,
          dietaryPreference: dto.dietaryPreference || null,
          categoryId: dto.categoryId,
          imageUrl: dto.imageUrl,
          images: dto.images || [],
          status: dto.status || ProductStatusEnum.ACTIVE,
          isTrending: dto.isTrending ?? false,
          isBestSeller: dto.isBestSeller ?? false,
          ...(dto.variants && dto.variants.length > 0
            ? {
                variants: {
                  create: dto.variants.map((v) => ({
                    name: v.name,
                    sku: v.sku || null,
                    price: v.price,
                    stock: v.stock ?? 0,
                    attributes: v.attributes || {},
                    imageUrl: v.imageUrl || null,
                  })),
                },
              }
            : {}),
          ...(dto.media && dto.media.length > 0
            ? {
                media: {
                  create: dto.media.map((m, index) => ({
                    type: m.type || 'IMAGE',
                    url: m.url,
                    thumbnailUrl: m.thumbnailUrl || null,
                    order: m.order ?? index,
                  })),
                },
              }
            : {}),
        },
        include: {
          category: true,
          variants: true,
          media: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return product;
    });

    return {
      success: true,
      message: 'Product created successfully',
      data: createdProduct,
    };
  }

  /**
   * PATCH /api/v1/admin/products/:id
   * Update existing product with optional variants and media updates
   */
  async updateProduct(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { variants: true, media: true },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Invalid categoryId: Category not found');
      }
    }

    let slug = existing.slug;
    if (dto.slug || (dto.name && dto.name !== existing.name && !dto.slug)) {
      slug = await this.ensureUniqueSlug(dto.slug || dto.name!, id);
    }

    const updatedProduct = await this.prisma.$transaction(async (tx) => {
      // 1. Update main product fields
      await tx.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(slug !== existing.slug && { slug }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.discountPrice !== undefined && { discountPrice: dto.discountPrice }),
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.brand !== undefined && { brand: dto.brand }),
          ...(dto.petSpecies !== undefined && { petSpecies: dto.petSpecies }),
          ...(dto.dietaryPreference !== undefined && {
            dietaryPreference: dto.dietaryPreference,
          }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.images !== undefined && { images: dto.images }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.isTrending !== undefined && { isTrending: dto.isTrending }),
          ...(dto.isBestSeller !== undefined && { isBestSeller: dto.isBestSeller }),
        },
      });

      // 2. Update variants if provided
      if (dto.variants) {
        const providedVariantIds = dto.variants
          .map((v) => v.id)
          .filter((vid): vid is string => !!vid);

        // Delete variants that were removed
        await tx.productVariant.deleteMany({
          where: {
            productId: id,
            id: { notIn: providedVariantIds },
          },
        });

        // Upsert variants
        for (const v of dto.variants) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                name: v.name,
                sku: v.sku || null,
                price: v.price,
                stock: v.stock ?? 0,
                attributes: v.attributes || {},
                imageUrl: v.imageUrl || null,
              },
            });
          } else {
            await tx.productVariant.create({
              data: {
                productId: id,
                name: v.name,
                sku: v.sku || null,
                price: v.price,
                stock: v.stock ?? 0,
                attributes: v.attributes || {},
                imageUrl: v.imageUrl || null,
              },
            });
          }
        }
      }

      // 3. Update media if provided
      if (dto.media) {
        const providedMediaIds = dto.media
          .map((m) => m.id)
          .filter((mid): mid is string => !!mid);

        // Delete removed media
        await tx.productMedia.deleteMany({
          where: {
            productId: id,
            id: { notIn: providedMediaIds },
          },
        });

        // Upsert media items
        for (let i = 0; i < dto.media.length; i++) {
          const m = dto.media[i];
          if (m.id) {
            await tx.productMedia.update({
              where: { id: m.id },
              data: {
                type: m.type || 'IMAGE',
                url: m.url,
                thumbnailUrl: m.thumbnailUrl || null,
                order: m.order ?? i,
              },
            });
          } else {
            await tx.productMedia.create({
              data: {
                productId: id,
                type: m.type || 'IMAGE',
                url: m.url,
                thumbnailUrl: m.thumbnailUrl || null,
                order: m.order ?? i,
              },
            });
          }
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          category: true,
          variants: { orderBy: { createdAt: 'asc' } },
          media: { orderBy: { order: 'asc' } },
        },
      });
    });

    return {
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct,
    };
  }

  /**
   * DELETE /api/v1/admin/products/:id
   * Soft-delete product (or hard delete if permanent=true)
   */
  async deleteProduct(id: string, permanent: boolean = false) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing || (!permanent && existing.deletedAt !== null)) {
      throw new NotFoundException('Product not found');
    }

    if (permanent) {
      await this.prisma.product.delete({
        where: { id },
      });
    } else {
      await this.prisma.product.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    return {
      success: true,
      message: permanent
        ? 'Product permanently deleted'
        : 'Product soft-deleted successfully',
    };
  }

  /**
   * PATCH /api/v1/admin/products/:id/status
   * Update single product status
   */
  async updateProductStatus(id: string, dto: UpdateProductStatusDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { status: dto.status },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: `Product status updated to ${dto.status}`,
      data: updated,
    };
  }

  /**
   * PATCH /api/v1/admin/products/bulk-status
   * Update status for multiple products
   */
  async bulkUpdateStatus(dto: BulkProductStatusDto) {
    if (!dto.productIds || dto.productIds.length === 0) {
      throw new BadRequestException('productIds array cannot be empty');
    }

    const result = await this.prisma.product.updateMany({
      where: {
        id: { in: dto.productIds },
        deletedAt: null,
      },
      data: {
        status: dto.status,
      },
    });

    return {
      success: true,
      message: `Successfully updated status to ${dto.status} for ${result.count} products`,
      data: {
        updatedCount: result.count,
        status: dto.status,
        productIds: dto.productIds,
      },
    };
  }

  /**
   * POST /api/v1/admin/products/bulk-delete
   * Bulk soft-delete (or hard-delete) multiple products
   */
  async bulkDelete(dto: BulkProductDeleteDto) {
    if (!dto.productIds || dto.productIds.length === 0) {
      throw new BadRequestException('productIds array cannot be empty');
    }

    let deletedCount = 0;
    if (dto.permanent) {
      const res = await this.prisma.product.deleteMany({
        where: { id: { in: dto.productIds } },
      });
      deletedCount = res.count;
    } else {
      const res = await this.prisma.product.updateMany({
        where: { id: { in: dto.productIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      deletedCount = res.count;
    }

    return {
      success: true,
      message: `Successfully deleted ${deletedCount} products`,
      data: {
        deletedCount,
        permanent: dto.permanent ?? false,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/products/:id/stock
   * Update main stock and/or variant stocks
   */
  async updateStock(id: string, dto: UpdateProductStockDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { variants: true },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.stock !== undefined) {
        await tx.product.update({
          where: { id },
          data: { stock: dto.stock },
        });
      }

      if (dto.variantStocks && dto.variantStocks.length > 0) {
        for (const vs of dto.variantStocks) {
          await tx.productVariant.update({
            where: { id: vs.variantId },
            data: { stock: vs.stock },
          });
        }
      }
    });

    const updated = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });

    return {
      success: true,
      message: 'Product stock updated successfully',
      data: updated,
    };
  }
}
