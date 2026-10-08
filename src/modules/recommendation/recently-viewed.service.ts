import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * "Pick Up Where You Left" — returns the products the authenticated customer
 * has actually viewed, newest first.
 *
 * This is deliberately a SEPARATE concept from RecommendationService: it only
 * replays the customer's own history and never predicts new products.
 */
@Injectable()
export class RecentlyViewedService {
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_LIMIT = 20;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /customer/products/recently-viewed
   */
  async getRecentlyViewed(userId: string, limit?: number) {
    const take = Math.min(
      limit ?? RecentlyViewedService.DEFAULT_LIMIT,
      RecentlyViewedService.MAX_LIMIT,
    );

    const views = await this.prisma.recentlyViewed.findMany({
      where: {
        userId,
        // Only surface products that are still available to the customer.
        product: { deletedAt: null, status: 'ACTIVE' },
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        product: {
          include: {
            variants: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    // Return full product objects (matching the product endpoints' shape) with
    // the viewedAt timestamp attached so the client can label the row.
    const products = views.map((v) => ({
      ...v.product,
      viewedAt: v.createdAt,
    }));

    return {
      success: true,
      products,
    };
  }
}
