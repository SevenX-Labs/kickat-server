import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { GetReviewsQueryDto, ReviewSortEnum } from "./dto/get-reviews-query.dto";
import { OrderStatusEnum, Prisma, ReviewStatusEnum } from "@prisma/client";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SPAM_LINK_REGEX =
  /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|xyz|top|site|online|io|co|in|ru|bet|link)(\/[^\s]*)?|bit\.ly\/[^\s]+|t\.me\/[^\s]+)/i;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, paramName: string = "id"): string {
    if (!id || typeof id !== "string" || !UUID_V4_REGEX.test(id)) {
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
    this.validateUuid(dto.productId, "productId");
    this.validateUuid(dto.orderId, "orderId");

    // 1. Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
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
        "Not a verified purchaser — must have ordered and received the product",
      );
    }

    // 6. Check duplicate review for this product-order pair
    const existingReview = await this.prisma.productReview.findFirst({
      where: {
        orderId: dto.orderId,
        productId: dto.productId,
      },
    });

    if (existingReview) {
      throw new ConflictException(
        "Review already submitted for this product-order pair",
      );
    }

    // Fetch user details for display
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const userName = user?.name || user?.email?.split("@")[0] || "Verified Buyer";

    const titleTrimmed = dto.title?.trim() || null;
    const commentTrimmed = dto.comment.trim();

    const contentToCheck = `${titleTrimmed || ""} ${commentTrimmed}`;
    const hasSpamLink = SPAM_LINK_REGEX.test(contentToCheck);
    const reviewStatus = hasSpamLink
      ? ReviewStatusEnum.REJECTED
      : ReviewStatusEnum.APPROVED;

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.productReview.create({
          data: {
            productId: dto.productId,
            userId,
            orderId: dto.orderId,
            userName,
            rating: dto.rating,
            title: titleTrimmed,
            comment: commentTrimmed,
            photos: dto.photos || [],
            isVerifiedPurchase: true,
            status: reviewStatus,
            isSpam: hasSpamLink,
            rejectionReason: hasSpamLink
              ? "Contains promotional or external link"
              : null,
          },
        });

        if (reviewStatus === ReviewStatusEnum.APPROVED) {
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
        }

        return created;
      });

      return {
        success: true,
        message: "Review submitted successfully",
        review,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "Review already submitted for this product-order pair",
        );
      }
      throw err;
    }
  }

  /**
   * GET /reviews
   */
  async getReviews(query: GetReviewsQueryDto) {
    this.validateUuid(query?.productId, "productId");

    const page = query.page && query.page > 0 ? query.page : 1;
    const rawLimit = query.limit && query.limit > 0 ? query.limit : 10;
    const limit = Math.min(50, Math.max(1, rawLimit));
    const skip = (page - 1) * limit;

    const where: any = {
      productId: query.productId,
      status: ReviewStatusEnum.APPROVED,
      isSpam: false,
      deletedAt: null,
    };

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

    let orderBy: any = [{ createdAt: "desc" }];
    if (query.sort === ReviewSortEnum.HELPFUL) {
      orderBy = [{ helpfulCount: "desc" }, { createdAt: "desc" }];
    } else if (query.sort === ReviewSortEnum.HIGHEST) {
      orderBy = [{ rating: "desc" }, { createdAt: "desc" }];
    } else if (query.sort === ReviewSortEnum.LOWEST) {
      orderBy = [{ rating: "asc" }, { createdAt: "desc" }];
    }

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          productId: true,
          userName: true,
          userAvatar: true,
          rating: true,
          title: true,
          comment: true,
          photos: true,
          isVerifiedPurchase: true,
          helpfulCount: true,
          createdAt: true,
        },
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
   * GET /reviews/summary
   */
  async getReviewSummary(productId: string) {
    this.validateUuid(productId, "productId");

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, rating: true, reviewsCount: true },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const ratingGroups = await this.prisma.productReview.groupBy({
      by: ["rating"],
      where: {
        productId,
        status: ReviewStatusEnum.APPROVED,
        isSpam: false,
        deletedAt: null,
      },
      _count: {
        rating: true,
      },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalApproved = 0;
    let sumRating = 0;

    for (const group of ratingGroups) {
      const count = group._count.rating;
      distribution[group.rating] = count;
      totalApproved += count;
      sumRating += group.rating * count;
    }

    const averageRating =
      totalApproved > 0
        ? Math.round((sumRating / totalApproved) * 10) / 10
        : 0;

    return {
      success: true,
      productId,
      summary: {
        averageRating,
        totalReviews: totalApproved,
        ratingDistribution: distribution,
      },
    };
  }

  /**
   * GET /reviews/:id
   */
  async getReviewById(id: string) {
    this.validateUuid(id, "id");

    const review = await this.prisma.productReview.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        userName: true,
        userAvatar: true,
        rating: true,
        title: true,
        comment: true,
        photos: true,
        isVerifiedPurchase: true,
        helpfulCount: true,
        status: true,
        isSpam: true,
        deletedAt: true,
        createdAt: true,
        product: {
          select: {
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    if (
      !review ||
      review.deletedAt ||
      review.isSpam ||
      review.status !== ReviewStatusEnum.APPROVED
    ) {
      throw new NotFoundException("Review not found");
    }

    const { status, isSpam, deletedAt, ...safeReview } = review;

    return {
      success: true,
      review: safeReview,
    };
  }

  /**
   * PATCH /reviews/:id/helpful (Toggle vote)
   */
  async markHelpful(userId: string, id: string) {
    this.validateUuid(id, "id");

    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });

    if (
      !review ||
      review.deletedAt ||
      review.isSpam ||
      review.status !== ReviewStatusEnum.APPROVED
    ) {
      throw new NotFoundException("Review not found");
    }

    if (review.userId === userId) {
      throw new BadRequestException("You cannot mark your own review as helpful");
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
      // Toggle OFF: remove vote, decrement count
      const updatedReview = await this.prisma.$transaction(async (tx) => {
        await tx.reviewHelpful.delete({
          where: {
            reviewId_userId: {
              reviewId: id,
              userId,
            },
          },
        });

        const current = await tx.productReview.findUnique({
          where: { id },
          select: { helpfulCount: true },
        });

        const newCount = Math.max(0, (current?.helpfulCount || 1) - 1);

        return tx.productReview.update({
          where: { id },
          data: {
            helpfulCount: newCount,
          },
        });
      });

      return {
        success: true,
        message: "Removed helpful vote",
        isHelpful: false,
        helpfulCount: updatedReview.helpfulCount,
      };
    } else {
      // Toggle ON: create vote, increment count
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
        message: "Marked review as helpful",
        isHelpful: true,
        helpfulCount: updatedReview.helpfulCount,
      };
    }
  }
}
