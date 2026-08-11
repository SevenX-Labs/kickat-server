import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewStatusEnum } from '@prisma/client';
import {
  AdminReplyReviewDto,
  AdminReviewsQueryDto,
  ToggleReviewSpamDto,
  UpdateReviewStatusDto,
} from './dto/admin-review.dto';

describe('Admin ReviewsController', () => {
  let controller: ReviewsController;
  let service: ReviewsService;

  const mockReviewsService = {
    getReviews: jest.fn(),
    getReviewById: jest.fn(),
    updateReviewStatus: jest.fn(),
    replyToReview: jest.fn(),
    toggleSpam: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        {
          provide: ReviewsService,
          useValue: mockReviewsService,
        },
      ],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
    service = module.get<ReviewsService>(ReviewsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getReviews should delegate to service', async () => {
    const expected = { success: true, data: { reviews: [] } };
    mockReviewsService.getReviews.mockResolvedValue(expected);

    const query: AdminReviewsQueryDto = { page: 1, limit: 10 };
    const result = await controller.getReviews(query);

    expect(result).toBe(expected);
    expect(mockReviewsService.getReviews).toHaveBeenCalledWith(query);
  });

  it('getReviewById should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockReviewsService.getReviewById.mockResolvedValue(expected);

    const result = await controller.getReviewById('rev-1');

    expect(result).toBe(expected);
    expect(mockReviewsService.getReviewById).toHaveBeenCalledWith('rev-1');
  });

  it('updateReviewStatus should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockReviewsService.updateReviewStatus.mockResolvedValue(expected);

    const dto: UpdateReviewStatusDto = { status: ReviewStatusEnum.APPROVED };
    const result = await controller.updateReviewStatus('rev-1', dto);

    expect(result).toBe(expected);
    expect(mockReviewsService.updateReviewStatus).toHaveBeenCalledWith('rev-1', dto);
  });

  it('replyToReview should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockReviewsService.replyToReview.mockResolvedValue(expected);

    const dto: AdminReplyReviewDto = { reply: 'Thanks!' };
    const result = await controller.replyToReview('rev-1', dto);

    expect(result).toBe(expected);
    expect(mockReviewsService.replyToReview).toHaveBeenCalledWith('rev-1', dto);
  });

  it('toggleSpam should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockReviewsService.toggleSpam.mockResolvedValue(expected);

    const dto: ToggleReviewSpamDto = { isSpam: true };
    const result = await controller.toggleSpam('rev-1', dto);

    expect(result).toBe(expected);
    expect(mockReviewsService.toggleSpam).toHaveBeenCalledWith('rev-1', dto);
  });
});
