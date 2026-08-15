import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatusEnum } from '@prisma/client';
import { ReviewSortEnum } from './dto/get-reviews-query.dto';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockProductId = '22222222-2222-4222-8222-222222222222';
  const mockOrderId = '33333333-3333-4333-8333-333333333333';
  const mockReviewId = '44444444-4444-4444-8444-444444444444';

  const mockProduct = {
    id: mockProductId,
    name: 'Super Dog Food',
    rating: 4.5,
    reviewsCount: 10,
  };

  const mockUser = {
    id: mockUserId,
    name: 'John Doe',
    email: 'john@example.com',
  };

  const mockOrder = {
    id: mockOrderId,
    userId: mockUserId,
    orderStatus: OrderStatusEnum.DELIVERED,
  };

  const mockReview = {
    id: mockReviewId,
    productId: mockProductId,
    userId: mockUserId,
    orderId: mockOrderId,
    userName: 'John Doe',
    rating: 5,
    comment: 'Great product, my pet loves it!',
    photos: [],
    isVerifiedPurchase: true,
    helpfulCount: 2,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      order: {
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
      },
      reviewHelpful: {
        findUnique: jest.fn(),
        create: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReview', () => {
    it('should throw NotFoundException if product is not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: 'Excellent product quality!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a verified purchaser', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: 'Excellent product quality!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if review was already submitted for order', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.productReview.findFirst.mockResolvedValue(mockReview);

      await expect(
        service.createReview(mockUserId, {
          productId: mockProductId,
          orderId: mockOrderId,
          rating: 5,
          comment: 'Excellent product quality!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should submit review successfully for verified purchaser', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.productReview.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.productReview.create.mockResolvedValue(mockReview);

      const res = await service.createReview(mockUserId, {
        productId: mockProductId,
        orderId: mockOrderId,
        rating: 5,
        comment: 'Excellent product quality!',
      });

      expect(res.success).toBe(true);
      expect(res.review).toBeDefined();
    });
  });

  describe('getReviews', () => {
    it('should return paginated list of reviews', async () => {
      const res = await service.getReviews({
        page: 1,
        limit: 10,
        sort: ReviewSortEnum.NEWEST,
      });

      expect(res.success).toBe(true);
      expect(res.reviews).toHaveLength(1);
    });
  });

  describe('getReviewById', () => {
    it('should throw BadRequestException if id is invalid UUID', async () => {
      await expect(service.getReviewById('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if review not found', async () => {
      prisma.productReview.findUnique.mockResolvedValue(null);
      await expect(service.getReviewById(mockReviewId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return review if found', async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      const res = await service.getReviewById(mockReviewId);
      expect(res.success).toBe(true);
      expect(res.review.id).toBe(mockReviewId);
    });
  });

  describe('markHelpful', () => {
    const voterUserId = '55555555-5555-4555-8555-555555555555';

    it('should throw BadRequestException if id is invalid UUID', async () => {
      await expect(service.markHelpful(voterUserId, 'invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if review not found', async () => {
      prisma.productReview.findUnique.mockResolvedValue(null);
      await expect(
        service.markHelpful(voterUserId, mockReviewId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user tries to mark their own review as helpful', async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview); // review.userId is mockUserId

      await expect(
        service.markHelpful(mockUserId, mockReviewId),
      ).rejects.toThrow(
        new BadRequestException('You cannot mark your own review as helpful'),
      );
    });

    it('should throw ConflictException if already marked helpful', async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      prisma.reviewHelpful.findUnique.mockResolvedValue({ id: 'vote_1' });

      await expect(
        service.markHelpful(voterUserId, mockReviewId),
      ).rejects.toThrow(ConflictException);
    });

    it('should mark review helpful successfully', async () => {
      prisma.productReview.findUnique.mockResolvedValue(mockReview);
      prisma.reviewHelpful.findUnique.mockResolvedValue(null);
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        helpfulCount: 3,
      });

      const res = await service.markHelpful(voterUserId, mockReviewId);
      expect(res.success).toBe(true);
      expect(res.helpfulCount).toBe(3);
    });
  });
});
