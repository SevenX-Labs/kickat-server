import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CategoryProductsQueryDto,
  ProductSortEnum,
} from './dto/category-products-query.dto';
import { ProductsTrendingQueryDto } from './dto/products-trending-query.dto';
import { ProductsBestSellersQueryDto } from './dto/products-best-sellers-query.dto';
import { ProductsRecommendedQueryDto } from './dto/products-recommended-query.dto';
import { BlogsQueryDto } from './dto/blogs-query.dto';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /home (Home feed aggregator)
   */
  async getHomeData(petId?: string) {
    let petSpeciesFilter: any = undefined;

    if (petId) {
      const pet = await this.prisma.pet.findUnique({
        where: { id: petId },
      });
      if (pet) {
        petSpeciesFilter = pet.species;
      }
    }

    const [banners, categories, trendingProducts, bestSellers] =
      await Promise.all([
        this.prisma.banner.findMany({
          where: { isActive: true },
          orderBy: { order: 'asc' },
          take: 5,
        }),
        this.prisma.category.findMany({
          where: { isActive: true, parentId: null },
          orderBy: { order: 'asc' },
          take: 8,
        }),
        this.prisma.product.findMany({
          where: {
            isTrending: true,
            ...(petSpeciesFilter && { petSpecies: petSpeciesFilter }),
          },
          orderBy: { rating: 'desc' },
          take: 10,
        }),
        this.prisma.product.findMany({
          where: {
            isBestSeller: true,
            ...(petSpeciesFilter && { petSpecies: petSpeciesFilter }),
          },
          orderBy: { reviewsCount: 'desc' },
          take: 10,
        }),
      ]);

    return {
      success: true,
      data: {
        banners,
        categories,
        trendingProducts,
        bestSellers,
      },
    };
  }

  /**
   * GET /home/banners
   */
  async getBanners() {
    const banners = await this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      banners,
    };
  }

  /**
   * GET /categories (Flat list)
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      categories,
    };
  }

  /**
   * GET /categories/tree (Hierarchical tree)
   */
  async getCategoryTree() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
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
   */
  async getCategoryById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: { where: { isActive: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category not found`);
    }

    return {
      success: true,
      category,
    };
  }

  /**
   * GET /categories/:id/products
   */
  async getCategoryProducts(
    categoryId: string,
    query: CategoryProductsQueryDto,
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category not found`);
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      categoryId,
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

  /**
   * GET /products/trending
   */
  async getTrendingProducts(query: ProductsTrendingQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      isTrending: true,
      ...(query.petSpecies ? { petSpecies: query.petSpecies.toUpperCase() as any } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereCondition,
        orderBy: { rating: 'desc' },
        skip,
        take: limit,
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
   * GET /products/best-sellers
   */
  async getBestSellers(query: ProductsBestSellersQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      isBestSeller: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.petSpecies ? { petSpecies: query.petSpecies.toUpperCase() as any } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereCondition,
        orderBy: { reviewsCount: 'desc' },
        skip,
        take: limit,
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
   * GET /products/recommended
   */
  async getRecommendedProducts(userId?: string, petId?: string) {
    let targetSpecies: any = undefined;

    if (petId) {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
      if (pet) {
        targetSpecies = pet.species;
      }
    } else if (userId) {
      const firstPet = await this.prisma.pet.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (firstPet) {
        targetSpecies = firstPet.species;
      }
    } else {
      throw new UnauthorizedException(
        'Authentication token or petId query parameter is required for recommendations',
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        ...(targetSpecies && { petSpecies: targetSpecies }),
      },
      orderBy: { rating: 'desc' },
      take: 12,
    });

    return {
      success: true,
      products,
    };
  }

  /**
   * GET /products/buy-again
   */
  async getBuyAgainProducts(userId: string, limit: number = 10) {
    const products = await this.prisma.product.findMany({
      orderBy: { reviewsCount: 'desc' },
      take: limit,
    });

    return {
      success: true,
      products,
    };
  }

  /**
   * GET /blogs
   */
  async getBlogs(query: BlogsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      isPublished: true,
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
    };

    const [blogs, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where: whereCondition,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count({ where: whereCondition }),
    ]);

    return {
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      blogs,
    };
  }

  /**
   * GET /blogs/categories
   */
  async getBlogCategories() {
    const blogs = await this.prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { category: true },
      distinct: ['category'],
    });

    const categories = blogs
      .map((b) => b.category)
      .filter((cat): cat is string => Boolean(cat));

    return {
      success: true,
      categories,
    };
  }

  /**
   * GET /blogs/:slug
   */
  async getBlogBySlug(slug: string) {
    const blog = await this.prisma.blogPost.findUnique({
      where: { slug },
    });

    if (!blog || !blog.isPublished) {
      throw new NotFoundException(`Blog post not found`);
    }

    return {
      success: true,
      blog,
    };
  }
}
