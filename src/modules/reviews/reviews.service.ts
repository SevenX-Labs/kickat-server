import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { GetReviewsQueryDto, ReviewSortEnum } from './dto/get-reviews-query.dto';
import { OrderStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, paramName: string = 'id'): string {
    if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(
        `${paramName} must be a valid UUID v4`,
      );
    }
    return id;
  }

  /**
   * POST /reviews
   */
  async createReview(userId: string, dto: CreateReviewDto) {
    this.validateUuid(dto.productId, 'productId');
    this.validateUuid(dto.orderId, 'orderId');

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Verify user is a verified purchaser who received the item in a DELIVERED order
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        userId,
        orderStatus: OrderStatusEnum.DELIVERED,
        items: {
          some: {
            productId: dto.productId,
          },
        },
      },
    });

    if (!order) {
      throw new ForbiddenException(
        'Not a verified purchaser — must have ordered and received the product',
      );
    }

    // Check duplicate review for this product-order pair
    const existingReview = await this.prisma.productReview.findFirst({
      where: {
        orderId: dto.orderId,
        productId: dto.productId,
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'Review already submitted for this product-order pair',
      );
    }

    // Fetch user details for display
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const userName = user?.name || user?.email?.split('@')[0] || 'Verified Buyer';

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productReview.create({
        data: {
          productId: dto.productId,
          userId,
          orderId: dto.orderId,
          userName,
          rating: dto.rating,
          comment: dto.comment,
          photos: dto.photos || [],
          isVerifiedPurchase: true,
        },
      });

      // Recalculate product rating & reviewsCount
      const totalReviews = product.reviewsCount + 1;
      const newRating =
        Math.round(
          ((product.rating * product.reviewsCount + dto.rating) / totalReviews) *
            10,
        ) / 10;

      await tx.product.update({
        where: { id: dto.productId },
        data: {
          rating: newRating,
          reviewsCount: totalReviews,
        },
      });

      return created;
    });

    return {
      success: true,
      message: 'Review submitted successfully',
      review,
    };
  }

  /**
   * GET /reviews
   */
  async getReviews(query: GetReviewsQueryDto) {
    if (query.productId) {
      this.validateUuid(query.productId, 'productId');
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.rating) {
      where.rating = query.rating;
    }

    if (query.hasPhotos) {
      where.photos = {
        isEmpty: false,
      };
    }

    if (query.verifiedOnly) {
      where.isVerifiedPurchase = true;
    }

    let orderBy: any = { createdAt: 'desc' };
    if (query.sort === ReviewSortEnum.HELPFUL) {
      orderBy = { helpfulCount: 'desc' };
    } else if (query.sort === ReviewSortEnum.HIGHEST) {
      orderBy = { rating: 'desc' };
    } else if (query.sort === ReviewSortEnum.LOWEST) {
      orderBy = { rating: 'asc' };
    }

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /reviews/:id
   */
  async getReviewById(id: string) {
    this.validateUuid(id, 'id');

    const review = await this.prisma.productReview.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return {
      success: true,
      review,
    };
  }

  /**
   * PATCH /reviews/:id/helpful
   */
  async markHelpful(userId: string, id: string) {
    this.validateUuid(id, 'id');

    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const existingVote = await this.prisma.reviewHelpful.findUnique({
      where: {
        reviewId_userId: {
          reviewId: id,
          userId,
        },
      },
    });

    if (existingVote) {
      throw new ConflictException('Already marked helpful');
    }

    const updatedReview = await this.prisma.$transaction(async (tx) => {
      await tx.reviewHelpful.create({
        data: {
          reviewId: id,
          userId,
        },
      });

      return tx.productReview.update({
        where: { id },
        data: {
          helpfulCount: { increment: 1 },
        },
      });
    });

    return {
      success: true,
      message: 'Marked review as helpful',
      helpfulCount: updatedReview.helpfulCount,
    };
  }
}
