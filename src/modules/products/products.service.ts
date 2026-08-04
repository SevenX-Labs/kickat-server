import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProductCatalogSortEnum,
  ProductsQueryDto,
} from './dto/products-query.dto';
import {
  ProductReviewsQueryDto,
  ReviewSortEnum,
} from './dto/product-reviews-query.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /products
   */
  async getProducts(query: ProductsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
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
      ...(query.rating !== undefined ? { rating: { gte: query.rating } } : {}),
    };

    let orderByCondition: any = { createdAt: 'desc' };
    if (query.sort === ProductCatalogSortEnum.POPULARITY) {
      orderByCondition = { reviewsCount: 'desc' };
    } else if (query.sort === ProductCatalogSortEnum.PRICE_ASC) {
      orderByCondition = { price: 'asc' };
    } else if (query.sort === ProductCatalogSortEnum.PRICE_DESC) {
      orderByCondition = { price: 'desc' };
    } else if (query.sort === ProductCatalogSortEnum.RATING) {
      orderByCondition = { rating: 'desc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereCondition,
        orderBy: orderByCondition,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.product.count({ where: whereCondition }),
    ]);

    return {
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      products,
    };
  }

  /**
   * GET /products/:id
   */
  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
        media: { orderBy: { order: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    return {
      success: true,
      product,
    };
  }

  /**
   * GET /products/:id/variants
   */
  async getProductVariants(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { productId: id },
    });

    return {
      success: true,
      productId: id,
      variants,
    };
  }

  /**
   * GET /products/:id/media
   */
  async getProductMedia(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const media = await this.prisma.productMedia.findMany({
      where: { productId: id },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      productId: id,
      media,
    };
  }

  /**
   * GET /products/:id/images
   */
  async getProductImages(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, images: true },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const mediaImages = await this.prisma.productMedia.findMany({
      where: { productId: id, type: 'IMAGE' },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      productId: id,
      mainImage: product.imageUrl,
      galleryImages: product.images,
      mediaImages,
    };
  }

  /**
   * GET /products/:id/videos
   */
  async getProductVideos(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const videos = await this.prisma.productMedia.findMany({
      where: { productId: id, type: 'VIDEO' },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      productId: id,
      videos,
    };
  }

  /**
   * GET /products/:id/related
   */
  async getRelatedProducts(id: string, limit: number = 10) {
    const target = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!target) {
      throw new NotFoundException(`Product not found`);
    }

    const related = await this.prisma.product.findMany({
      where: {
        NOT: { id: target.id },
        OR: [
          { categoryId: target.categoryId },
          ...(target.petSpecies ? [{ petSpecies: target.petSpecies }] : []),
        ],
      },
      orderBy: { rating: 'desc' },
      take: limit,
    });

    return {
      success: true,
      productId: id,
      relatedProducts: related,
    };
  }

  /**
   * GET /products/:id/reviews
   */
  async getProductReviews(id: string, query: ProductReviewsQueryDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, rating: true, reviewsCount: true },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      productId: id,
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.verifiedOnly ? { isVerifiedPurchase: true } : {}),
      ...(query.hasPhotos ? { photos: { isEmpty: false } } : {}),
    };

    let orderByCondition: any = { createdAt: 'desc' };
    if (query.sort === ReviewSortEnum.HELPFUL) {
      orderByCondition = { helpfulCount: 'desc' };
    } else if (query.sort === ReviewSortEnum.HIGHEST) {
      orderByCondition = { rating: 'desc' };
    } else if (query.sort === ReviewSortEnum.LOWEST) {
      orderByCondition = { rating: 'asc' };
    }

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where: whereCondition,
        orderBy: orderByCondition,
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where: whereCondition }),
    ]);

    return {
      success: true,
      productId: id,
      summary: {
        averageRating: product.rating,
        totalReviews: product.reviewsCount,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      reviews,
    };
  }
}
