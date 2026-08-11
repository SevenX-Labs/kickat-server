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
import { CategoriesService } from './categories.service';
import { AdminAuth } from '../../../common';
import {
  AdminCategoriesQueryDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/admin-category.dto';

@AdminAuth()
@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * GET /api/v1/admin/categories
   * List all categories (flat or tree) with filters and summary stats
   */
  @Get()
  async getCategories(@Query() query: AdminCategoriesQueryDto) {
    return this.categoriesService.getCategories(query);
  }

  /**
   * GET /api/v1/admin/categories/tree
   * Category tree hierarchy (root categories with nested subcategories)
   */
  @Get('tree')
  async getCategoryTree() {
    return this.categoriesService.getCategoryTree();
  }

  /**
   * PATCH /api/v1/admin/categories/reorder
   * Reorder display sequence across categories
   */
  @Patch('reorder')
  async reorderCategories(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorderCategories(dto);
  }

  /**
   * GET /api/v1/admin/categories/:id
   * Single category details with subcategories and products count
   */
  @Get(':id')
  async getCategoryById(@Param('id') id: string) {
    return this.categoriesService.getCategoryById(id);
  }

  /**
   * POST /api/v1/admin/categories
   * Create category or subcategory
   */
  @Post()
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  /**
   * PATCH /api/v1/admin/categories/:id/status
   * Activate or deactivate category
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.categoriesService.updateStatus(id, dto);
  }

  /**
   * PATCH /api/v1/admin/categories/:id
   * Update category fields, slug, image, or parentId
   */
  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateCategory(id, dto);
  }

  /**
   * DELETE /api/v1/admin/categories/:id
   * Delete category (protected against deletion if products are assigned)
   */
  @Delete(':id')
  async deleteCategory(
    @Param('id') id: string,
    @Query('permanent') permanent?: boolean,
  ) {
    return this.categoriesService.deleteCategory(id, permanent);
  }
}
