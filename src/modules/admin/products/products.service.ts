import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

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
        { descriptionTitle: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { materials: { contains: s, mode: 'insensitive' } },
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
              discountPrice: true,
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
      this.prisma.product.count({
        where: { deletedAt: null, status: ProductStatusEnum.ACTIVE },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, status: ProductStatusEnum.DRAFT },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, status: ProductStatusEnum.INACTIVE },
      }),
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

    if (
      dto.discountPrice !== undefined &&
      dto.discountPrice !== null &&
      dto.discountPrice > dto.price
    ) {
      throw new BadRequestException(
        'Discount price (selling price) cannot exceed regular price (MRP)',
      );
    }

    // 2. Canonical image normalization & products namespace relocation
    const rawImages =
      dto.images && dto.images.length > 0
        ? dto.images
        : dto.imageUrl
          ? [dto.imageUrl]
          : [];
    const images = await this.uploadService.relocateMultipleToNamespace(
      rawImages,
      'products',
    );
    let primaryImageUrl = dto.imageUrl
      ? (await this.uploadService.relocateToNamespace(
          dto.imageUrl,
          'products',
        )) || dto.imageUrl
      : images[0] || '';
    if (!primaryImageUrl && images.length > 0) {
      primaryImageUrl = images[0];
    }

    if (images.length > 9) {
      throw new BadRequestException('A maximum of 9 product images is allowed');
    }

    if (dto.variants && dto.variants.length > 0) {
      const skus = dto.variants
        .map((v) => v.sku?.trim().toLowerCase())
        .filter(Boolean);
      const duplicate = skus.find((s, idx) => skus.indexOf(s) !== idx);
      if (duplicate) {
        throw new BadRequestException(
          `Duplicate variant SKU found: ${duplicate}`,
        );
      }

      for (const v of dto.variants) {
        if (v.price < 0) {
          throw new BadRequestException(
            `Variant "${v.name}" price cannot be negative`,
          );
        }
        if (v.discountPrice !== undefined && v.discountPrice !== null) {
          if (v.discountPrice < 0) {
            throw new BadRequestException(
              `Variant "${v.name}" discountPrice cannot be negative`,
            );
          }
          if (v.discountPrice >= v.price) {
            throw new BadRequestException(
              `Variant "${v.name}" discountPrice (${v.discountPrice}) must be less than regular price (${v.price})`,
            );
          }
        }
      }
    }

    const hasVariants = dto.variants && dto.variants.length > 0;
    const effectiveStock = hasVariants
      ? dto.variants!.reduce((sum, v) => sum + (v.stock ?? 0), 0)
      : (dto.stock ?? 0);

    // 3. Generate unique slug
    const slug = await this.ensureUniqueSlug(dto.slug || dto.name);

    // 4. Create product in transaction
    const createdProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          descriptionTitle:
            dto.descriptionTitle && dto.descriptionTitle.trim().length > 0
              ? dto.descriptionTitle.trim()
              : null,
          description: dto.description || null,
          materials:
            dto.materials && dto.materials.trim().length > 0
              ? dto.materials.trim()
              : null,
          price: dto.price,
          discountPrice: dto.discountPrice || null,
          stock: effectiveStock,
          brand: dto.brand || null,
          petSpecies: dto.petSpecies || null,
          dietaryPreference: dto.dietaryPreference || null,
          categoryId: dto.categoryId,
          imageUrl: primaryImageUrl,
          images: images,
          status: dto.status || ProductStatusEnum.ACTIVE,
          seoTitle: dto.seoTitle || null,
          seoDescription: dto.seoDescription || null,
          attributes: (dto.attributes as any) || null,
          highlights: (dto.highlights as any) || null,
          ingredients: (dto.ingredients as any) || null,
          feedingGuide: (dto.feedingGuide as any) || null,
          careInstructions: dto.careInstructions || [],
          sizeGuide: (dto.sizeGuide as any) || null,
          isTrending: dto.isTrending ?? false,
          isBestSeller: dto.isBestSeller ?? false,
          ...(dto.variants && dto.variants.length > 0
            ? {
                variants: {
                  create: await Promise.all(
                    dto.variants.map(async (v) => ({
                      name: v.name,
                      sku: v.sku || null,
                      price: v.price,
                      discountPrice: v.discountPrice || null,
                      stock: v.stock ?? 0,
                      attributes: v.attributes || {},
                      imageUrl: v.imageUrl
                        ? (await this.uploadService.relocateToNamespace(
                            v.imageUrl,
                            'products',
                          )) || v.imageUrl
                        : null,
                    })),
                  ),
                },
              }
            : {}),
          ...(images.length > 0
            ? {
                media: {
                  create: images.map((url, index) => ({
                    type: 'IMAGE',
                    url,
                    thumbnailUrl: null,
                    order: index,
                  })),
                },
              }
            : dto.media && dto.media.length > 0
              ? {
                  media: {
                    create: dto.media.map((m, index) => ({
                      type: 'IMAGE',
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

    const effectivePrice = dto.price !== undefined ? dto.price : existing.price;
    const effectiveDiscountPrice =
      dto.discountPrice !== undefined
        ? dto.discountPrice
        : existing.discountPrice;
    if (
      effectiveDiscountPrice !== null &&
      effectiveDiscountPrice !== undefined &&
      effectiveDiscountPrice > effectivePrice
    ) {
      throw new BadRequestException(
        'Discount price (selling price) cannot exceed regular price (MRP)',
      );
    }

    if (dto.images && dto.images.length > 9) {
      throw new BadRequestException('A maximum of 9 product images is allowed');
    }

    if (dto.variants && dto.variants.length > 0) {
      const skus = dto.variants
        .map((v) => v.sku?.trim().toLowerCase())
        .filter(Boolean);
      const duplicate = skus.find((s, idx) => skus.indexOf(s) !== idx);
      if (duplicate) {
        throw new BadRequestException(
          `Duplicate variant SKU found: ${duplicate}`,
        );
      }

      for (const v of dto.variants) {
        if (v.price < 0) {
          throw new BadRequestException(
            `Variant "${v.name}" price cannot be negative`,
          );
        }
        if (v.discountPrice !== undefined && v.discountPrice !== null) {
          if (v.discountPrice < 0) {
            throw new BadRequestException(
              `Variant "${v.name}" discountPrice cannot be negative`,
            );
          }
          if (v.discountPrice >= v.price) {
            throw new BadRequestException(
              `Variant "${v.name}" discountPrice (${v.discountPrice}) must be less than regular price (${v.price})`,
            );
          }
        }
      }
    }

    const hasVariants = dto.variants && dto.variants.length > 0;
    const effectiveStock = hasVariants
      ? dto.variants!.reduce((sum, v) => sum + (v.stock ?? 0), 0)
      : (dto.stock ?? 0);

    let slug = existing.slug;
    if (dto.slug || (dto.name && dto.name !== existing.name && !dto.slug)) {
      slug = await this.ensureUniqueSlug(dto.slug || dto.name!, id);
    }

    // Relocate product images and variant images to 'products' namespace
    const relocatedImages =
      dto.images !== undefined
        ? await this.uploadService.relocateMultipleToNamespace(
            dto.images,
            'products',
          )
        : undefined;
    let relocatedImageUrl: string | undefined = undefined;
    if (dto.imageUrl) {
      relocatedImageUrl =
        (await this.uploadService.relocateToNamespace(
          dto.imageUrl,
          'products',
        )) || dto.imageUrl;
    }

    const relocatedVariants = dto.variants
      ? await Promise.all(
          dto.variants.map(async (v) => ({
            ...v,
            imageUrl: v.imageUrl
              ? (await this.uploadService.relocateToNamespace(
                  v.imageUrl,
                  'products',
                )) || v.imageUrl
              : v.imageUrl,
          })),
        )
      : undefined;

    // Gallery diff cleanup calculation
    let imagesToDelete: string[] = [];
    if (relocatedImages !== undefined) {
      const existingImages = existing.images || [];
      const newImagesSet = new Set(relocatedImages);
      const removedImages = existingImages.filter(
        (oldImg) => !newImagesSet.has(oldImg),
      );

      // Do NOT delete image if still referenced by any remaining variant
      const remainingVariantImages = new Set<string>();
      if (relocatedVariants) {
        for (const v of relocatedVariants) {
          if (v.imageUrl) remainingVariantImages.add(v.imageUrl);
        }
      } else if (existing.variants) {
        for (const v of existing.variants) {
          if (v.imageUrl) remainingVariantImages.add(v.imageUrl);
        }
      }

      imagesToDelete = removedImages.filter(
        (img) => !remainingVariantImages.has(img),
      );
    }

    const updatedProduct = await this.prisma.$transaction(async (tx) => {
      // 1. Update main product fields
      await tx.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(slug !== existing.slug && { slug }),
          ...(dto.descriptionTitle !== undefined && {
            descriptionTitle:
              dto.descriptionTitle && dto.descriptionTitle.trim().length > 0
                ? dto.descriptionTitle.trim()
                : null,
          }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.materials !== undefined && {
            materials:
              dto.materials && dto.materials.trim().length > 0
                ? dto.materials.trim()
                : null,
          }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.discountPrice !== undefined && {
            discountPrice: dto.discountPrice,
          }),
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.brand !== undefined && { brand: dto.brand }),
          ...(dto.petSpecies !== undefined && { petSpecies: dto.petSpecies }),
          ...(dto.dietaryPreference !== undefined && {
            dietaryPreference: dto.dietaryPreference,
          }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(relocatedImageUrl !== undefined && {
            imageUrl: relocatedImageUrl,
          }),
          ...(relocatedImages !== undefined && {
            images: relocatedImages,
            ...(!relocatedImageUrl &&
              !dto.imageUrl &&
              relocatedImages.length > 0 && { imageUrl: relocatedImages[0] }),
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.seoTitle !== undefined && { seoTitle: dto.seoTitle }),
          ...(dto.seoDescription !== undefined && {
            seoDescription: dto.seoDescription,
          }),
          ...(dto.attributes !== undefined && {
            attributes: dto.attributes as any,
          }),
          ...(dto.highlights !== undefined && {
            highlights: dto.highlights as any,
          }),
          ...(dto.ingredients !== undefined && {
            ingredients: dto.ingredients as any,
          }),
          ...(dto.feedingGuide !== undefined && {
            feedingGuide: dto.feedingGuide as any,
          }),
          ...(dto.careInstructions !== undefined && {
            careInstructions: dto.careInstructions,
          }),
          ...(dto.sizeGuide !== undefined && {
            sizeGuide: dto.sizeGuide as any,
          }),
          ...(dto.isTrending !== undefined && { isTrending: dto.isTrending }),
          ...(dto.isBestSeller !== undefined && {
            isBestSeller: dto.isBestSeller,
          }),
        },
      });

      // Synchronize media: images[] is canonical
      if (relocatedImages !== undefined) {
        await tx.productMedia.deleteMany({
          where: { productId: id },
        });
        for (let i = 0; i < relocatedImages.length; i++) {
          await tx.productMedia.create({
            data: {
              productId: id,
              type: 'IMAGE',
              url: relocatedImages[i],
              thumbnailUrl: null,
              order: i,
            },
          });
        }
      } else if (dto.media) {
        const providedMediaIds = dto.media
          .map((m) => m.id)
          .filter((mid): mid is string => !!mid);

        await tx.productMedia.deleteMany({
          where: {
            productId: id,
            id: { notIn: providedMediaIds },
          },
        });

        for (let i = 0; i < dto.media.length; i++) {
          const m = dto.media[i];
          if (m.id) {
            await tx.productMedia.update({
              where: { id: m.id },
              data: {
                type: 'IMAGE',
                url: m.url,
                thumbnailUrl: m.thumbnailUrl || null,
                order: m.order ?? i,
              },
            });
          } else {
            await tx.productMedia.create({
              data: {
                productId: id,
                type: 'IMAGE',
                url: m.url,
                thumbnailUrl: m.thumbnailUrl || null,
                order: m.order ?? i,
              },
            });
          }
        }
      }

      // 2. Update variants if provided
      if (relocatedVariants) {
        const providedVariantIds = relocatedVariants
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
        for (const v of relocatedVariants) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                name: v.name,
                sku: v.sku || null,
                price: v.price,
                discountPrice: v.discountPrice || null,
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
                discountPrice: v.discountPrice || null,
                stock: v.stock ?? 0,
                attributes: v.attributes || {},
                imageUrl: v.imageUrl || null,
              },
            });
          }
        }

        // Recalculate derived product stock from variants
        const activeVariants = await tx.productVariant.findMany({
          where: { productId: id },
          select: { stock: true },
        });
        if (activeVariants.length > 0) {
          const totalVariantStock = activeVariants.reduce(
            (sum, v) => sum + v.stock,
            0,
          );
          await tx.product.update({
            where: { id },
            data: { stock: totalVariantStock },
          });
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

    // Physically delete removed images that are not shared by remaining variants
    if (imagesToDelete.length > 0) {
      try {
        await this.uploadService.deleteFilesByUrls(imagesToDelete);
      } catch (err: any) {
        this.logger.warn(
          `Failed to cleanup removed product images for product "${id}": ${err?.message || err}`,
        );
      }
    }

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
      include: {
        variants: true,
        media: true,
      },
    });

    if (!existing || (!permanent && existing.deletedAt !== null)) {
      throw new NotFoundException('Product not found');
    }

    const imageUrls: string[] = [];
    if (existing.imageUrl) imageUrls.push(existing.imageUrl);
    if (Array.isArray(existing.images)) imageUrls.push(...existing.images);
    if (Array.isArray(existing.media)) {
      for (const m of existing.media) {
        if (m.url) imageUrls.push(m.url);
        if (m.thumbnailUrl) imageUrls.push(m.thumbnailUrl);
      }
    }
    if (Array.isArray(existing.variants)) {
      for (const v of existing.variants) {
        if (v.imageUrl) imageUrls.push(v.imageUrl);
      }
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

    if (imageUrls.length > 0) {
      await this.uploadService.deleteFilesByUrls(imageUrls);
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

    const productsToDelete = await this.prisma.product.findMany({
      where: { id: { in: dto.productIds } },
      include: {
        variants: true,
        media: true,
      },
    });

    const imageUrls: string[] = [];
    for (const prod of productsToDelete) {
      if (prod.imageUrl) imageUrls.push(prod.imageUrl);
      if (Array.isArray(prod.images)) imageUrls.push(...prod.images);
      if (Array.isArray(prod.media)) {
        for (const m of prod.media) {
          if (m.url) imageUrls.push(m.url);
          if (m.thumbnailUrl) imageUrls.push(m.thumbnailUrl);
        }
      }
      if (Array.isArray(prod.variants)) {
        for (const v of prod.variants) {
          if (v.imageUrl) imageUrls.push(v.imageUrl);
        }
      }
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

    if (imageUrls.length > 0) {
      await this.uploadService.deleteFilesByUrls(imageUrls);
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
      if (dto.variantStocks && dto.variantStocks.length > 0) {
        for (const vs of dto.variantStocks) {
          await tx.productVariant.update({
            where: { id: vs.variantId },
            data: { stock: vs.stock },
          });
        }
      }

      // Check current variants
      const activeVariants = await tx.productVariant.findMany({
        where: { productId: id },
        select: { stock: true },
      });

      if (activeVariants.length > 0) {
        // Variant stock is authoritative: product stock is derived sum of variants
        const totalVariantStock = activeVariants.reduce(
          (sum, v) => sum + v.stock,
          0,
        );
        await tx.product.update({
          where: { id },
          data: { stock: totalVariantStock },
        });
      } else if (dto.stock !== undefined) {
        // Without variants: product stock is authoritative
        await tx.product.update({
          where: { id },
          data: { stock: dto.stock },
        });
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
