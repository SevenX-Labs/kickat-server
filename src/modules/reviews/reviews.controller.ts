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
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { Auth, CurrentUser } from '../../common';
import { CreateReviewDto } from './dto/create-review.dto';
import { GetReviewsQueryDto } from './dto/get-reviews-query.dto';

@Controller('reviews')
@UseGuards(ThrottlerGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   */
  @SkipThrottle()
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
  @SkipThrottle()
  @Get()
  async getReviews(@Query() query: GetReviewsQueryDto) {
    return this.reviewsService.getReviews(query);
  }

  /**
   * GET /reviews/:id (Public)
   */
  @SkipThrottle()
  @Get(':id')
  async getReviewById(@Param('id') id: string) {
    return this.reviewsService.getReviewById(id);
  }

  /**
   * PATCH /reviews/:id/helpful (20 req / min / IP)
   */
  @Throttle({
    'reviews-helpful': { limit: 20, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    search: { limit: 10000, ttl: 60000 },
    products: { limit: 10000, ttl: 60000 },
    'guest-cart': { limit: 10000, ttl: 60000 },
  })
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
