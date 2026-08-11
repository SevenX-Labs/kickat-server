import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AdminAuth } from '../../../common';
import {
  AdminReplyReviewDto,
  AdminReviewsQueryDto,
  ToggleReviewSpamDto,
  UpdateReviewStatusDto,
} from './dto/admin-review.dto';

@AdminAuth()
@Controller('admin/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * GET /api/v1/admin/reviews
   * List reviews with moderation status filters, search, and KPI metrics
   */
  @Get()
  async getReviews(@Query() query: AdminReviewsQueryDto) {
    return this.reviewsService.getReviews(query);
  }

  /**
   * GET /api/v1/admin/reviews/:id
   * Get single review details
   */
  @Get(':id')
  async getReviewById(@Param('id') id: string) {
    return this.reviewsService.getReviewById(id);
  }

  /**
   * PATCH /api/v1/admin/reviews/:id/status
   * Moderate review status (PENDING, APPROVED, REJECTED)
   */
  @Patch(':id/status')
  async updateReviewStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewsService.updateReviewStatus(id, dto);
  }

  /**
   * POST /api/v1/admin/reviews/:id/reply
   * Add official store admin reply
   */
  @Post(':id/reply')
  async replyToReview(
    @Param('id') id: string,
    @Body() dto: AdminReplyReviewDto,
  ) {
    return this.reviewsService.replyToReview(id, dto);
  }

  /**
   * PATCH /api/v1/admin/reviews/:id/spam
   * Flag or unflag review as spam
   */
  @Patch(':id/spam')
  async toggleSpam(
    @Param('id') id: string,
    @Body() dto: ToggleReviewSpamDto,
  ) {
    return this.reviewsService.toggleSpam(id, dto);
  }
}
