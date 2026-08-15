import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewSortEnum } from './dto/get-reviews-query.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let service: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockProductId = '22222222-2222-4222-8222-222222222222';
  const mockOrderId = '33333333-3333-4333-8333-333333333333';
  const mockReviewId = '44444444-4444-4444-8444-444444444444';

  beforeEach(async () => {
    service = {
      createReview: jest.fn().mockResolvedValue({
        success: true,
        review: { id: mockReviewId },
      }),
      getReviews: jest.fn().mockResolvedValue({
        success: true,
        reviews: [],
      }),
      getReviewById: jest.fn().mockResolvedValue({
        success: true,
        review: { id: mockReviewId },
      }),
      markHelpful: jest.fn().mockResolvedValue({
        success: true,
        helpfulCount: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: service }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call createReview', async () => {
    const dto = {
      productId: mockProductId,
      orderId: mockOrderId,
      rating: 5,
      comment: 'Excellent product quality!',
    };

    const res = await controller.createReview(mockUserId, dto);
    expect(service.createReview).toHaveBeenCalledWith(mockUserId, dto);
    expect(res.success).toBe(true);
  });

  it('should call getReviews', async () => {
    const query = { page: 1, limit: 10, sort: ReviewSortEnum.NEWEST };
    const res = await controller.getReviews(query);
    expect(service.getReviews).toHaveBeenCalledWith(query);
    expect(res.success).toBe(true);
  });

  it('should call getReviewById', async () => {
    const res = await controller.getReviewById(mockReviewId);
    expect(service.getReviewById).toHaveBeenCalledWith(mockReviewId);
    expect(res.success).toBe(true);
  });

  it('should call markHelpful', async () => {
    const res = await controller.markHelpful(mockUserId, mockReviewId);
    expect(service.markHelpful).toHaveBeenCalledWith(mockUserId, mockReviewId);
    expect(res.success).toBe(true);
  });
});
