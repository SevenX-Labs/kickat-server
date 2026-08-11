import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ReviewStatusEnum } from '@prisma/client';
import { AdminReviewSortEnum } from './dto/admin-review.dto';

describe('Admin ReviewsService', () => {
  let service: ReviewsService;
  let prisma: any;

  const mockPrismaService = {
    productReview: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getReviews', () => {
    it('should return paginated reviews list with KPI summary statistics', async () => {
      const mockReviews = [
        {
          id: 'rev-1',
          productId: 'prod-1',
          userName: 'Jane Doe',
          rating: 5,
          comment: 'Great product!',
          status: ReviewStatusEnum.APPROVED,
          isSpam: false,
          createdAt: new Date(),
          product: { id: 'prod-1', name: 'Dog Food', rating: 4.8 },
        },
      ];

      prisma.productReview.findMany.mockResolvedValue(mockReviews);
      prisma.productReview.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(0) // pending
        .mockResolvedValueOnce(1) // approved
        .mockResolvedValueOnce(0) // rejected
        .mockResolvedValueOnce(0); // spam
      prisma.productReview.aggregate.mockResolvedValue({ _avg: { rating: 5 } });

      const result = await service.getReviews({
        page: 1,
        limit: 10,
        status: ReviewStatusEnum.APPROVED,
        sort: AdminReviewSortEnum.RATING_DESC,
      });

      expect(result.success).toBe(true);
      expect(result.data.reviews.length).toBe(1);
      expect(result.data.summary.totalReviews).toBe(1);
      expect(result.data.summary.approvedCount).toBe(1);
      expect(result.data.summary.averageRating).toBe(5);
    });
  });

  describe('getReviewById', () => {
    it('should return review by ID with customer and order info', async () => {
      const mockReview = {
        id: 'rev-1',
        userId: 'user-1',
        orderId: 'ord-1',
        userName: 'Jane Doe',
        rating: 5,
        product: { id: 'prod-1', name: 'Dog Food' },
      };

      prisma.productReview.findFirst.mockResolvedValue(mockReview);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
      prisma.order.findUnique.mockResolvedValue({ id: 'ord-1', orderNumber: 'ORD-1001' });

      const result: any = await service.getReviewById('rev-1');

      expect(result.success).toBe(true);
      expect(result.data.customer.email).toBe('jane@example.com');
      expect(result.data.order.orderNumber).toBe('ORD-1001');
    });

    it('should throw NotFoundException if review does not exist', async () => {
      prisma.productReview.findFirst.mockResolvedValue(null);

      await expect(service.getReviewById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateReviewStatus', () => {
    it('should update review status and sync product rating', async () => {
      const mockReview = { id: 'rev-1', productId: 'prod-1', status: ReviewStatusEnum.PENDING };
      prisma.productReview.findFirst.mockResolvedValue(mockReview);
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        status: ReviewStatusEnum.APPROVED,
      });
      prisma.productReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { id: 10 },
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.updateReviewStatus('rev-1', {
        status: ReviewStatusEnum.APPROVED,
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(ReviewStatusEnum.APPROVED);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { rating: 4.5, reviewsCount: 10 },
      });
    });
  });

  describe('replyToReview', () => {
    it('should post admin reply with timestamp', async () => {
      const mockReview = { id: 'rev-1' };
      prisma.productReview.findFirst.mockResolvedValue(mockReview);
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        adminReply: 'Thank you for your feedback!',
        adminReplyAt: new Date(),
      });

      const result = await service.replyToReview('rev-1', {
        reply: 'Thank you for your feedback!',
      });

      expect(result.success).toBe(true);
      expect(result.data.adminReply).toBe('Thank you for your feedback!');
    });
  });

  describe('toggleSpam', () => {
    it('should flag review as spam and auto-reject it', async () => {
      const mockReview = { id: 'rev-1', productId: 'prod-1', status: ReviewStatusEnum.APPROVED };
      prisma.productReview.findFirst.mockResolvedValue(mockReview);
      prisma.productReview.update.mockResolvedValue({
        ...mockReview,
        isSpam: true,
        status: ReviewStatusEnum.REJECTED,
      });
      prisma.productReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.0 },
        _count: { id: 2 },
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.toggleSpam('rev-1', { isSpam: true });

      expect(result.success).toBe(true);
      expect(result.data.isSpam).toBe(true);
      expect(result.data.status).toBe(ReviewStatusEnum.REJECTED);
      expect(prisma.product.update).toHaveBeenCalled();
    });
  });
});
