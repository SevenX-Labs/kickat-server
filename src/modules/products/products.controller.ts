import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsQueryDto } from './dto/products-query.dto';
import { ProductIdParamDto } from './dto/product-id-param.dto';
import { ProductRelatedQueryDto } from './dto/product-related-query.dto';
import { ProductReviewsQueryDto } from './dto/product-reviews-query.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products
   */
  @Get()
  async getProducts(@Query() query: ProductsQueryDto) {
    return this.productsService.getProducts(query);
  }

  /**
   * GET /products/:id
   */
  @Get(':id')
  async getProductById(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductById(params.id);
  }

  /**
   * GET /products/:id/variants
   */
  @Get(':id/variants')
  async getProductVariants(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductVariants(params.id);
  }

  /**
   * GET /products/:id/media
   */
  @Get(':id/media')
  async getProductMedia(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductMedia(params.id);
  }

  /**
   * GET /products/:id/images
   */
  @Get(':id/images')
  async getProductImages(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductImages(params.id);
  }

  /**
   * GET /products/:id/videos
   */
  @Get(':id/videos')
  async getProductVideos(@Param() params: ProductIdParamDto) {
    return this.productsService.getProductVideos(params.id);
  }

  /**
   * GET /products/:id/related
   */
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
  @Get(':id/reviews')
  async getProductReviews(
    @Param() params: ProductIdParamDto,
    @Query() query: ProductReviewsQueryDto,
  ) {
    return this.productsService.getProductReviews(params.id, query);
  }
}
