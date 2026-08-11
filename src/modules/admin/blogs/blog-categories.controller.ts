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
import { BlogsService } from './blogs.service';
import { AdminAuth } from '../../../common';
import {
  BlogCategoriesQueryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from './dto/admin-blog.dto';

@AdminAuth()
@Controller('admin/blog-categories')
export class BlogCategoriesController {
  constructor(private readonly blogsService: BlogsService) {}

  /**
   * GET /api/v1/admin/blog-categories
   * List all blog categories with post count metrics
   */
  @Get()
  async getBlogCategories(@Query() query: BlogCategoriesQueryDto) {
    return this.blogsService.getBlogCategories(query);
  }

  /**
   * POST /api/v1/admin/blog-categories
   * Create a new blog category
   */
  @Post()
  async createBlogCategory(@Body() dto: CreateBlogCategoryDto) {
    return this.blogsService.createBlogCategory(dto);
  }

  /**
   * PATCH /api/v1/admin/blog-categories/:id
   * Update blog category
   */
  @Patch(':id')
  async updateBlogCategory(
    @Param('id') id: string,
    @Body() dto: UpdateBlogCategoryDto,
  ) {
    return this.blogsService.updateBlogCategory(id, dto);
  }

  /**
   * DELETE /api/v1/admin/blog-categories/:id
   * Delete blog category
   */
  @Delete(':id')
  async deleteBlogCategory(@Param('id') id: string) {
    return this.blogsService.deleteBlogCategory(id);
  }
}
