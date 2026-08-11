import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewStatusEnum } from '@prisma/client';
import {
  AdminReviewSortEnum,
  AdminReviewsQueryDto,
  AdminReplyReviewDto,
  ToggleReviewSpamDto,
  UpdateReviewStatusDto,
} from './dto/admin-review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to recalculate and sync product rating & reviewsCount
   */
  private async syncProductRating(productId: string) {
    const aggregate = await this.prisma.productReview.aggregate({
      where: {
        productId,
        status: ReviewStatusEnum.APPROVED,
        isSpam: false,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { id: true },
    });

    const avgRating = aggregate._avg.rating
      ? Number(aggregate._avg.rating.toFixed(2))
      : 0;
    const reviewsCount = aggregate._count.id || 0;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        rating: avgRating,
        reviewsCount,
      },
    });

    return { avgRating, reviewsCount };
  }

  /**
   * GET /api/v1/admin/reviews
   * List reviews with moderation status filters, search, and KPI metrics
   */
  async getReviews(query: AdminReviewsQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.isSpam !== undefined) {
      where.isSpam = query.isSpam;
    }

    if (query.rating) {
      where.rating = query.rating;
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { userName: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
        { comment: { contains: s, mode: 'insensitive' } },
        { product: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminReviewSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminReviewSortEnum.RATING_DESC:
        orderBy = { rating: 'desc' };
        break;
      case AdminReviewSortEnum.RATING_ASC:
        orderBy = { rating: 'asc' };
        break;
      case AdminReviewSortEnum.HELPFUL_DESC:
        orderBy = { helpfulCount: 'desc' };
        break;
      case AdminReviewSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [reviews, total, pendingCount, approvedCount, rejectedCount, spamCount, ratingAgg] =
      await Promise.all([
        this.prisma.productReview.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                rating: true,
                reviewsCount: true,
              },
            },
          },
        }),
        this.prisma.productReview.count({ where }),
        this.prisma.productReview.count({
          where: { ...where, status: ReviewStatusEnum.PENDING },
        }),
        this.prisma.productReview.count({
          where: { ...where, status: ReviewStatusEnum.APPROVED },
        }),
        this.prisma.productReview.count({
          where: { ...where, status: ReviewStatusEnum.REJECTED },
        }),
        this.prisma.productReview.count({
          where: { ...where, isSpam: true },
        }),
        this.prisma.productReview.aggregate({
          where: { ...where, status: ReviewStatusEnum.APPROVED, isSpam: false },
          _avg: { rating: true },
        }),
      ]);

    const formattedReviews = reviews.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product?.name || 'Unknown Product',
      productSlug: r.product?.slug || null,
      userId: r.userId,
      orderId: r.orderId,
      userName: r.userName,
      userAvatar: r.userAvatar,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      photos: r.photos,
      isVerifiedPurchase: r.isVerifiedPurchase,
      helpfulCount: r.helpfulCount,
      status: r.status,
      isSpam: r.isSpam,
      adminReply: r.adminReply,
      adminReplyAt: r.adminReplyAt,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        reviews: formattedReviews,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalReviews: total,
          pendingCount,
          approvedCount,
          rejectedCount,
          spamCount,
          averageRating: ratingAgg._avg.rating
            ? Number(ratingAgg._avg.rating.toFixed(2))
            : 0,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reviews/:id
   * Get single review details
   */
  async getReviewById(id: string) {
    const review = await this.prisma.productReview.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            rating: true,
            reviewsCount: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    let customerInfo: any = null;
    if (review.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: review.userId },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (user) {
        customerInfo = user;
      }
    }

    let orderInfo: any = null;
    if (review.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: review.orderId },
        select: { id: true, orderNumber: true, orderStatus: true, createdAt: true },
      });
      if (order) {
        orderInfo = order;
      }
    }

    return {
      success: true,
      data: {
        ...review,
        productName: review.product?.name || 'Unknown Product',
        customer: customerInfo,
        order: orderInfo,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/reviews/:id/status
   * Moderate review status (PENDING, APPROVED, REJECTED)
   */
  async updateReviewStatus(id: string, dto: UpdateReviewStatusDto) {
    const existing = await this.prisma.productReview.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.rejectionReason !== undefined && {
          rejectionReason: dto.status === ReviewStatusEnum.REJECTED ? dto.rejectionReason : null,
        }),
      },
    });

    // Sync product overall rating
    await this.syncProductRating(existing.productId);

    return {
      success: true,
      message: `Review status updated to ${dto.status}`,
      data: updated,
    };
  }

  /**
   * POST /api/v1/admin/reviews/:id/reply
   * Add official store admin reply
   */
  async replyToReview(id: string, dto: AdminReplyReviewDto) {
    const existing = await this.prisma.productReview.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        adminReply: dto.reply.trim(),
        adminReplyAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Admin reply submitted successfully',
      data: updated,
    };
  }

  /**
   * PATCH /api/v1/admin/reviews/:id/spam
   * Flag or unflag review as spam
   */
  async toggleSpam(id: string, dto: ToggleReviewSpamDto) {
    const existing = await this.prisma.productReview.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const nextStatus = dto.isSpam
      ? ReviewStatusEnum.REJECTED
      : existing.status;

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        isSpam: dto.isSpam,
        status: nextStatus,
      },
    });

    // Sync product overall rating
    await this.syncProductRating(existing.productId);

    return {
      success: true,
      message: dto.isSpam ? 'Review marked as spam' : 'Review unflagged from spam',
      data: updated,
    };
  }
}
