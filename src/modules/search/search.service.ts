import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto, SearchSortEnum } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /search (Full-text product search with filters)
   */
  async search(dto: SearchQueryDto, userId?: string) {
    const page = dto.page || 1;
    const limit = dto.limit || 10;
    const skip = (page - 1) * limit;

    // Save recent search if user is logged in
    if (userId && dto.q.trim()) {
      this.prisma.recentSearch
        .create({
          data: {
            userId,
            query: dto.q.trim(),
          },
        })
        .catch(() => {});
    }

    const searchKeyword = dto.q.trim();

    const whereCondition: any = {
      OR: [
        { name: { contains: searchKeyword, mode: 'insensitive' } },
        { description: { contains: searchKeyword, mode: 'insensitive' } },
        { brand: { contains: searchKeyword, mode: 'insensitive' } },
      ],
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.priceMin !== undefined || dto.priceMax !== undefined
        ? {
            price: {
              ...(dto.priceMin !== undefined && { gte: dto.priceMin }),
              ...(dto.priceMax !== undefined && { lte: dto.priceMax }),
            },
          }
        : {}),
      ...(dto.rating !== undefined ? { rating: { gte: dto.rating } } : {}),
      ...(dto.brand ? { brand: { contains: dto.brand, mode: 'insensitive' } } : {}),
      ...(dto.petSpecies ? { petSpecies: dto.petSpecies.toUpperCase() as any } : {}),
      ...(dto.diet ? { dietaryPreference: dto.diet.toUpperCase() as any } : {}),
    };

    let orderByCondition: any = { rating: 'desc' };
    if (dto.sort === SearchSortEnum.PRICE_ASC) {
      orderByCondition = { price: 'asc' };
    } else if (dto.sort === SearchSortEnum.PRICE_DESC) {
      orderByCondition = { price: 'desc' };
    } else if (dto.sort === SearchSortEnum.NEWEST) {
      orderByCondition = { createdAt: 'desc' };
    } else if (dto.sort === SearchSortEnum.RATING) {
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
      query: searchKeyword,
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
   * GET /search/suggestions
   */
  async getSuggestions(q: string) {
    const keyword = q.trim();

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { brand: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: { name: true, brand: true },
      take: 8,
    });

    const suggestionsSet = new Set<string>();
    for (const p of products) {
      if (p.name.toLowerCase().includes(keyword.toLowerCase())) {
        suggestionsSet.add(p.name);
      }
      if (p.brand && p.brand.toLowerCase().includes(keyword.toLowerCase())) {
        suggestionsSet.add(p.brand);
      }
    }

    return {
      success: true,
      query: keyword,
      suggestions: Array.from(suggestionsSet).slice(0, 8),
    };
  }

  /**
   * GET /search/recent
   */
  async getRecentSearches(userId: string) {
    const searches = await this.prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['query'],
      take: 10,
    });

    return {
      success: true,
      recentSearches: searches.map((s) => ({
        id: s.id,
        query: s.query,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * DELETE /search/recent/:queryId
   */
  async deleteRecentSearch(userId: string, queryId: string) {
    const search = await this.prisma.recentSearch.findFirst({
      where: { id: queryId, userId },
    });

    if (!search) {
      throw new NotFoundException('Recent search query not found');
    }

    await this.prisma.recentSearch.delete({
      where: { id: queryId },
    });

    return {
      success: true,
      message: 'Recent search query deleted successfully',
    };
  }

  /**
   * GET /search/trending
   */
  async getTrendingSearches() {
    const trendingQueries = [
      'Dog Food',
      'Cat Toys',
      'Grain Free Diet',
      'Puppy Shampoo',
      'Rabbit Cage',
      'Persian Cat Grooming',
      'Fish Tank Filter',
      'Bird Seed Mix',
    ];

    return {
      success: true,
      trending: trendingQueries,
    };
  }

  /**
   * GET /search/filters
   */
  async getFilters(categoryId?: string) {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new BadRequestException('Invalid category ID');
      }
    }

    const whereCondition = categoryId ? { categoryId } : {};

    const [products, aggregate] = await Promise.all([
      this.prisma.product.findMany({
        where: whereCondition,
        select: { brand: true, petSpecies: true, dietaryPreference: true },
        distinct: ['brand', 'petSpecies', 'dietaryPreference'],
      }),
      this.prisma.product.aggregate({
        where: whereCondition,
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    const brands = Array.from(
      new Set(products.map((p) => p.brand).filter(Boolean)),
    );
    const petSpecies = Array.from(
      new Set(products.map((p) => p.petSpecies).filter(Boolean)),
    );
    const dietaryPreferences = Array.from(
      new Set(products.map((p) => p.dietaryPreference).filter(Boolean)),
    );

    return {
      success: true,
      filters: {
        brands,
        priceRange: {
          min: aggregate._min.price ?? 0,
          max: aggregate._max.price ?? 10000,
        },
        petSpecies,
        dietaryPreferences,
        sortOptions: [
          'relevance',
          'price_asc',
          'price_desc',
          'newest',
          'rating',
        ],
      },
    };
  }
}
