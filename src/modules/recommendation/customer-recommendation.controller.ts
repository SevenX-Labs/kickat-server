import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Auth, CurrentUser } from '../../common';
import { CustomerActivityService } from './customer-activity.service';
import { RecentlyViewedService } from './recently-viewed.service';
import { RecommendationService } from './recommendation.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { RecentlyViewedQueryDto } from './dto/recently-viewed-query.dto';
import { RecordSearchDto } from './dto/record-search.dto';
import { RecordViewDto } from './dto/record-view.dto';

/**
 * Customer-facing recommendation & activity endpoints.
 *
 * SECURITY: every route is JWT-guarded via @Auth(). The customer is ALWAYS
 * resolved from req.user.id (the @CurrentUser('id') decorator). No route reads
 * a userId from the query, body or params — any such field is rejected by the
 * global whitelisting ValidationPipe.
 */
@Auth()
@Controller('customer')
@UseGuards(ThrottlerGuard)
export class CustomerRecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly recentlyViewedService: RecentlyViewedService,
    private readonly activityService: CustomerActivityService,
  ) {}

  /**
   * GET /customer/products/recommended  ("Suggested for You")
   */
  @Throttle({ products: { limit: 120, ttl: 60000 } })
  @Get('products/recommended')
  async getRecommended(
    @CurrentUser('id') userId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendationService.getRecommended(userId, query.limit);
  }

  /**
   * GET /customer/products/recently-viewed  ("Pick Up Where You Left")
   */
  @Throttle({ products: { limit: 120, ttl: 60000 } })
  @Get('products/recently-viewed')
  async getRecentlyViewed(
    @CurrentUser('id') userId: string,
    @Query() query: RecentlyViewedQueryDto,
  ) {
    return this.recentlyViewedService.getRecentlyViewed(userId, query.limit);
  }

  /**
   * POST /customer/activity/search  (records a search term)
   */
  @Throttle({ products: { limit: 120, ttl: 60000 } })
  @Post('activity/search')
  @HttpCode(HttpStatus.OK)
  async recordSearch(
    @CurrentUser('id') userId: string,
    @Body() dto: RecordSearchDto,
  ) {
    return this.activityService.recordSearch(userId, dto.query);
  }

  /**
   * POST /customer/activity/view  (records a product view)
   */
  @Throttle({ products: { limit: 120, ttl: 60000 } })
  @Post('activity/view')
  @HttpCode(HttpStatus.OK)
  async recordView(
    @CurrentUser('id') userId: string,
    @Body() dto: RecordViewDto,
  ) {
    return this.activityService.recordView(userId, dto.productId);
  }
}
