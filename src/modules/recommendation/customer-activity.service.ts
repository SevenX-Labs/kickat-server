import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Captures the signals used by the recommendation engine.
 *
 * Reuses the EXISTING `recent_searches` and `recently_viewed` tables — no new
 * schema is introduced here. The authenticated userId is always supplied by the
 * controller from the JWT; the client only provides the query / productId.
 */
@Injectable()
export class CustomerActivityService {
  /** Keep the per-user recently-viewed list bounded (matches existing behaviour). */
  private static readonly MAX_RECENTLY_VIEWED = 20;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /customer/activity/search
   * Records a search term for the authenticated customer.
   */
  async recordSearch(userId: string, query: string) {
    const term = query.trim();

    await this.prisma.recentSearch.create({
      data: { userId, query: term },
    });

    return {
      success: true,
      message: 'Search term recorded.',
    };
  }

  /**
   * POST /customer/activity/view
   * Records a product view for the authenticated customer.
   *
   * Uses the existing unique (userId, productId) constraint so repeat views of
   * the same product refresh the timestamp instead of creating duplicates.
   */
  async recordView(userId: string, productId: string) {
    // Validate the product exists and is not soft-deleted before recording.
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { createdAt: new Date() },
    });

    // Trim anything beyond the most recent MAX_RECENTLY_VIEWED entries.
    const excess = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: CustomerActivityService.MAX_RECENTLY_VIEWED,
      select: { id: true },
    });

    if (excess.length > 0) {
      await this.prisma.recentlyViewed.deleteMany({
        where: { id: { in: excess.map((e) => e.id) } },
      });
    }

    return {
      success: true,
      message: 'Product view recorded.',
    };
  }
}
