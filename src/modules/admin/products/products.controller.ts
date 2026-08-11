import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { AdminAuth } from '../../../common';
import {
  AdminProductsQueryDto,
  BulkProductDeleteDto,
  BulkProductStatusDto,
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateProductStockDto,
} from './dto/admin-product.dto';

@AdminAuth()
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /api/v1/admin/products
   * List all products with advanced filtering, search, sorting, and pagination
   */
  @Get()
  async getProducts(@Query() query: AdminProductsQueryDto) {
    return this.productsService.getProducts(query);
  }

  /**
   * PATCH /api/v1/admin/products/bulk-status
   * Bulk activate/deactivate/draft products
   */
  @Patch('bulk-status')
  async bulkUpdateStatus(@Body() dto: BulkProductStatusDto) {
    return this.productsService.bulkUpdateStatus(dto);
  }

  /**
   * POST /api/v1/admin/products/bulk-delete
   * Bulk soft-delete or permanently delete products
   */
  @Post('bulk-delete')
  async bulkDelete(@Body() dto: BulkProductDeleteDto) {
    return this.productsService.bulkDelete(dto);
  }

  /**
   * GET /api/v1/admin/products/:id
   * Get single product details by ID or Slug
   */
  @Get(':id')
  async getProductById(@Param('id') id: string) {
    return this.productsService.getProductById(id);
  }

  /**
   * POST /api/v1/admin/products
   * Create a new product with optional variants and media
   */
  @Post()
  async createProduct(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  /**
   * PATCH /api/v1/admin/products/:id/status
   * Update product status (ACTIVE, DRAFT, INACTIVE)
   */
  @Patch(':id/status')
  async updateProductStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateProductStatus(id, dto);
  }

  /**
   * PATCH /api/v1/admin/products/:id/stock
   * Quick update product and variant stock
   */
  @Patch(':id/stock')
  async updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateProductStockDto,
  ) {
    return this.productsService.updateStock(id, dto);
  }

  /**
   * PATCH /api/v1/admin/products/:id
   * Update product fields, variants, and media
   */
  @Patch(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, dto);
  }

  /**
   * DELETE /api/v1/admin/products/:id
   * Soft-delete product (or permanent delete if permanent=true)
   */
  @Delete(':id')
  async deleteProduct(
    @Param('id') id: string,
    @Query('permanent') permanent?: boolean,
  ) {
    return this.productsService.deleteProduct(id, permanent);
  }
}
