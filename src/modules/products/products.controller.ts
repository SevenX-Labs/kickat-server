import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { ProductsService } from './products.service';
import { ProductsQueryDto } from './dto/products-query.dto';
import { ProductIdParamDto } from './dto/product-id-param.dto';
import { ProductRelatedQueryDto } from './dto/product-related-query.dto';
import { ProductReviewsQueryDto } from './dto/product-reviews-query.dto';

@Controller('products')
@UseGuards(ThrottlerGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products (60 req / min / IP)
   */
  @Throttle({
    products: { limit: 60, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    search: { limit: 10000, ttl: 60000 },
    'guest-cart': { limit: 10000, ttl: 60000 },
    'reviews-helpful': { limit: 10000, ttl: 60000 },
  })
  @Get()
  async getProducts(@Query() query: ProductsQueryDto) {
    return this.productsService.getProducts(query);
  }

  /**
   * GET /products/:id
   */
  @SkipThrottle()
  @Get(':id')
  async getProductById(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductById(params.id);
  }

  /**
   * GET /products/:id/variants
   */
  @SkipThrottle()
  @Get(':id/variants')
  async getProductVariants(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductVariants(params.id);
  }

  /**
   * GET /products/:id/media
   */
  @SkipThrottle()
  @Get(':id/media')
  async getProductMedia(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductMedia(params.id);
  }

  /**
   * GET /products/:id/images
   */
  @SkipThrottle()
  @Get(':id/images')
  async getProductImages(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductImages(params.id);
  }

  /**
   * GET /products/:id/videos
   */
  @SkipThrottle()
  @Get(':id/videos')
  async getProductVideos(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductVideos(params.id);
  }

  /**
   * GET /products/:id/related
   */
  @SkipThrottle()
  @Get(':id/related')
  async getRelatedProducts(
    @Param() params: ProductIdParamDto,
    @Query() query: ProductRelatedQueryDto,
  ) {
    return this.productsService.getRelatedProducts(params.id, query.limit);
  }

  /**
   * GET /products/:id/reviews
   */
  @SkipThrottle()
  @Get(':id/reviews')
  async getProductReviews(
    @Param() params: ProductIdParamDto,
    @Query() query: ProductReviewsQueryDto,
  ) {
    return this.productsService.getProductReviews(params.id, query);
  }
}
