import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchSuggestionsQueryDto } from './dto/search-suggestions-query.dto';
import { SearchFiltersQueryDto } from './dto/search-filters-query.dto';
import { QueryIdParamDto } from './dto/query-id-param.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search
   */
  @Get()
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.searchService.search(query, userId);
  }

  /**
   * GET /search/suggestions
   */
  @Get('suggestions')
  async getSuggestions(@Query() query: SearchSuggestionsQueryDto) {
    return this.searchService.getSuggestions(query.q);
  }

  /**
   * GET /search/recent (Auth Required)
   */
  @Auth()
  @Get('recent')
  async getRecentSearches(@CurrentUser('id') userId: string) {
    return this.searchService.getRecentSearches(userId);
  }

  /**
   * DELETE /search/recent/:queryId (Auth Required)
   */
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
  @Get('trending')
  async getTrendingSearches() {
    return this.searchService.getTrendingSearches();
  }

  /**
   * GET /search/popular
   */
  @Get('popular')
  async getPopularSearches() {
    return this.searchService.getPopularSearches();
  }

  /**
   * GET /search/filters
   */
  @Get('filters')
  async getFilters(@Query() query: SearchFiltersQueryDto) {
    return this.searchService.getFilters(query.categoryId);
  }
}
