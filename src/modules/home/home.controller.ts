import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeQueryDto } from './dto/home-query.dto';
import { ProductsTrendingQueryDto } from './dto/products-trending-query.dto';
import { ProductsRecommendedQueryDto } from './dto/products-recommended-query.dto';
import { ProductsBuyAgainQueryDto } from './dto/products-buy-again-query.dto';
import { BlogsQueryDto } from './dto/blogs-query.dto';
import { UuidParamDto } from './dto/uuid-param.dto';
import { BlogSlugParamDto } from './dto/blog-slug-param.dto';
import { ReorderDto } from '../orders/dto/reorder.dto';
import { Auth, CurrentUser } from '../../common';

@Controller()
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /**
   * GET /home
   */
  @Get('home')
  async getHome(@Query() query: HomeQueryDto) {
    return this.homeService.getHomeData(query.petId);
  }

  /**
   * GET /home/banners
   */
  @Get('home/banners')
  async getBanners() {
    return this.homeService.getBanners();
  }



  /**
   * GET /products/trending
   */
  @Get('products/trending')
  async getTrendingProducts(@Query() query: ProductsTrendingQueryDto) {
    return this.homeService.getTrendingProducts(query);
  }

  /**
   * GET /products/best-sellers
   */
  @Get('products/best-sellers')
  async getBestSellers(@Query() query: ProductsBestSellersQueryDto) {
    return this.homeService.getBestSellers(query);
  }

  /**
   * GET /products/recommended
   */
  @Get('products/recommended')
  async getRecommendedProducts(
    @CurrentUser('id') userId?: string,
    @Query() query?: ProductsRecommendedQueryDto,
  ) {
    return this.homeService.getRecommendedProducts(userId, query?.petId);
  }

  /**
   * GET /products/buy-again (Auth Required)
   */
  @Auth()
  @Get('products/buy-again')
  async getBuyAgainProducts(
    @CurrentUser('id') userId: string,
    @Query() query: ProductsBuyAgainQueryDto,
  ) {
    return this.homeService.getBuyAgainProducts(userId, query.limit);
  }

  /**
   * POST /products/buy-again/reorder (Auth Required)
   */
  @Auth()
  @Post('products/buy-again/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderBuyAgain(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.homeService.reorderBuyAgainProduct(
      userId,
      dto.productId!,
      dto.variantId,
      dto.quantity,
    );
  }

  /**
   * POST /products/reorder (Auth Required)
   */
  @Auth()
  @Post('products/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderProduct(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.homeService.reorderBuyAgainProduct(
      userId,
      dto.productId!,
      dto.variantId,
      dto.quantity,
    );
  }

  /**
   * GET /blogs/categories (Must be above :slug)
   */
  @Get('blogs/categories')
  async getBlogCategories() {
    return this.homeService.getBlogCategories();
  }

  /**
   * GET /blogs
   */
  @Get('blogs')
  async getBlogs(@Query() query: BlogsQueryDto) {
    return this.homeService.getBlogs(query);
  }

  /**
   * GET /blogs/:slug
   */
  @Get('blogs/:slug')
  async getBlogBySlug(@Param() params: BlogSlugParamDto) {
    return this.homeService.getBlogBySlug(params.slug);
  }
}
