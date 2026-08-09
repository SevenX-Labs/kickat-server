import { Controller, Get, Param, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoryParamDto } from './dto/category-param.dto';
import { CategoryProductsQueryDto } from './dto/category-products-query.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * GET /categories
   */
  @Get()
  async getCategories() {
    return this.categoriesService.getCategories();
  }

  /**
   * GET /categories/tree (Must be above :id)
   */
  @Get('tree')
  async getCategoryTree() {
    return this.categoriesService.getCategoryTree();
  }

  /**
   * GET /categories/:id
   */
  @Get(':id')
  async getCategoryById(@Param() params: CategoryParamDto) {
    return this.categoriesService.getCategoryById(params.id);
  }

  /**
   * GET /categories/:id/products
   */
  @Get(':id/products')
  async getCategoryProducts(
    @Param() params: CategoryParamDto,
    @Query() query: CategoryProductsQueryDto,
  ) {
    return this.categoriesService.getCategoryProducts(params.id, query);
  }
}
