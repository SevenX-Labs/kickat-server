import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Auth, CurrentUser } from '../../common';
import { CreateReviewDto } from './dto/create-review.dto';
import { GetReviewsQueryDto } from './dto/get-reviews-query.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   */
  @Auth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(userId, dto);
  }

  /**
   * GET /reviews (Public)
   */
  @Get()
  async getReviews(@Query() query: GetReviewsQueryDto) {
    return this.reviewsService.getReviews(query);
  }

  /**
   * GET /reviews/:id (Public)
   */
  @Get(':id')
  async getReviewById(@Param('id') id: string) {
    return this.reviewsService.getReviewById(id);
  }

  /**
   * PATCH /reviews/:id/helpful
   */
  @Auth()
  @Patch(':id/helpful')
  @HttpCode(HttpStatus.OK)
  async markHelpful(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.reviewsService.markHelpful(userId, id);
  }
}
