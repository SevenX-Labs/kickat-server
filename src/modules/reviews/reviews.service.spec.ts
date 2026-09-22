import { Test, TestingModule } from "@nestjs/testing";
import { ReviewsService } from "./reviews.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ReviewSortEnum } from "./dto/get-reviews-query.dto";
import { OrderStatusEnum, ReviewStatusEnum } from "@prisma/client";

describe("ReviewsService", () => {
  let service: ReviewsService;
  let prisma: any;

  const mockUserId = "11111111-1111-4111-8111-111111111111";
  const mockProductId = "22222222-2222-4222-8222-222222222222";
  const mockOrderId = "33333333-3333-4333-8333-333333333333";
  const mockReviewId = "44444444-4444-4444-8444-444444444444";

  const mockProduct = {
    id: mockProductId,
    rating: 4.5,
    reviewsCount: 10,
  };

  const mockOrder = {
    id: mockOrderId,
    userId: mockUserId,
    orderStatus: OrderStatusEnum.DELIVERED,
  };

  const mockUser = {
    id: mockUserId,
    name: "John Doe",
    email: "john@example.com",
  };

  const mockReview = {
    id: mockReviewId,
    productId: mockProductId,
    userId: mockUserId,
    orderId: mockOrderId,
    userName: "John Doe",
    userAvatar: null,
    rating: 5,
    title: "Great quality!",
    comment: "My dog loves this kibble.",
    photos: [],
    isVerifiedPurchase: true,
    helpfulCount: 2,
    status: ReviewStatusEnum.APPROVED,
    isSpam: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      orderItem: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      productReview: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([mockReview]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([
          { rating: 5, _count: { rating: 8 } },
          { rating: 4, _count: { rating: 2 } },
        ]),
      },
      reviewHelpful: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createReview", () => {
    it("should throw NotFoundException if product is not found", async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: "Excellent product quality!",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if order is not found or not owned/delivered", async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: "Excellent product quality!",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ConflictException if review was already submitted for order", async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.productReview.findFirst.mockResolvedValue(mockReview);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: "Excellent product quality!",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should submit review successfully for verified purchaser", async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.productReview.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.productReview.create.mockResolvedValue(mockReview);

      const res = await service.createReview(mockUserId, {
        productId: mockProductId,
        orderId: mockOrderId,
        rating: 5,
        comment: "Excellent product quality!",
      });

      expect(res.success).toBe(true);
      expect(res.review).toBeDefined();
    });
  });

  describe("getReviews", () => {
    it("should throw BadRequestException if productId is invalid or missing", async () => {
      await expect(
        service.getReviews({ productId: "invalid-id" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("should return paginated list of reviews for a product", async () => {
      const res = await service.getReviews({
        productId: mockProductId,
        page: 1,
        limit: 10,
        sort: ReviewSortEnum.NEWEST,
      });

      expect(res.success).toBe(true);
      expect(res.reviews).toHaveLength(1);
    });
  });

  describe("getReviewSummary", () => {
    it("should calculate rating distribution and average rating", async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      const res = await service.getReviewSummary(mockProductId);

      expect(res.success).toBe(true);
      expect(res.summary.totalReviews).toBe(10);
      expect(res.summary.ratingDistribution[5]).toBe(8);
      expect(res.summary.ratingDistribution[4]).toBe(2);
      expect(res.summary.ratingDistribution[1]).toBe(0);
    });
  });

  describe("getReviewById", () => {
    it("should throw BadRequestException if id is invalid UUID", async () => {
      await expect(service.getReviewById("invalid-id")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw NotFoundException if review not found", async () => {
      prisma.productReview.findUnique.mockResolvedValue(null);
      await expect(service.getReviewById(mockReviewId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return review if found and approved", async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      const res = await service.getReviewById(mockReviewId);
      expect(res.success).toBe(true);
      expect(res.review.id).toBe(mockReviewId);
    });
  });

  describe("markHelpful", () => {
    const voterUserId = "55555555-5555-4555-8555-555555555555";

    it("should throw BadRequestException if id is invalid UUID", async () => {
      await expect(service.markHelpful(voterUserId, "invalid-id")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw NotFoundException if review not found", async () => {
      prisma.productReview.findUnique.mockResolvedValue(null);
      await expect(
        service.markHelpful(voterUserId, mockReviewId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if user tries to mark their own review as helpful", async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);

      await expect(
        service.markHelpful(mockUserId, mockReviewId),
      ).rejects.toThrow(
        new BadRequestException("You cannot mark your own review as helpful"),
      );
    });

    it("should toggle OFF helpful vote if already voted", async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      prisma.reviewHelpful.findUnique.mockResolvedValue({ id: "vote_1" });
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        helpfulCount: 1,
      });

      const res = await service.markHelpful(voterUserId, mockReviewId);
      expect(res.success).toBe(true);
      expect(res.isHelpful).toBe(false);
      expect(res.helpfulCount).toBe(1);
    });

    it("should toggle ON helpful vote if not yet voted", async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      prisma.reviewHelpful.findUnique.mockResolvedValue(null);
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        helpfulCount: 3,
      });

      const res = await service.markHelpful(voterUserId, mockReviewId);
      expect(res.success).toBe(true);
      expect(res.isHelpful).toBe(true);
      expect(res.helpfulCount).toBe(3);
    });
  });
});
