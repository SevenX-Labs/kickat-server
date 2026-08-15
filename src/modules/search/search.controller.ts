import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchSuggestionsQueryDto } from './dto/search-suggestions-query.dto';
import { SearchFiltersQueryDto } from './dto/search-filters-query.dto';
import { QueryIdParamDto } from './dto/query-id-param.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('search')
@UseGuards(ThrottlerGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search (30 req / min / IP)
   */
  @Throttle({
    search: { limit: 30, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    products: { limit: 10000, ttl: 60000 },
    'guest-cart': { limit: 10000, ttl: 60000 },
    'reviews-helpful': { limit: 10000, ttl: 60000 },
  })
  @Get()
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.searchService.search(query, userId);
  }

  /**
   * GET /search/suggestions (30 req / min / IP)
   */
  @Throttle({
    search: { limit: 30, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    products: { limit: 10000, ttl: 60000 },
    'guest-cart': { limit: 10000, ttl: 60000 },
    'reviews-helpful': { limit: 10000, ttl: 60000 },
  })
  @Get('suggestions')
  async getSuggestions(@Query() query: SearchSuggestionsQueryDto) {
    return this.searchService.getSuggestions(query.q);
  }

  /**
   * GET /search/recent (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Get('recent')
  async getRecentSearches(@CurrentUser('id') userId: string) {
    return this.searchService.getRecentSearches(userId);
  }

  /**
   * DELETE /search/recent/:queryId (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Delete('recent/:queryId')
  @HttpCode(HttpStatus.OK)
  async deleteRecentSearch(
    @CurrentUser('id') userId: string,
    @Param() params: QueryIdParamDto,
  ) {
    return this.searchService.deleteRecentSearch(userId, params.queryId);
  }

  /**
   * GET /search/trending
   */
  @SkipThrottle()
  @Get('trending')
  async getTrendingSearches() {
    return this.searchService.getTrendingSearches();
  }

  /**
   * GET /search/popular
   */
  @SkipThrottle()
  @Get('popular')
  async getPopularSearches() {
    return this.searchService.getPopularSearches();
  }

  /**
   * GET /search/filters
   */
  @SkipThrottle()
  @Get('filters')
  async getFilters(@Query() query: SearchFiltersQueryDto) {
    return this.searchService.getFilters(query.categoryId);
  }
}
