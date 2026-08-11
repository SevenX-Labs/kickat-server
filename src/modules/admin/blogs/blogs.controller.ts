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
  AdminBlogsQueryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from './dto/admin-blog.dto';

@AdminAuth()
@Controller('admin/blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  /**
   * GET /api/v1/admin/blogs
   * List all blog posts with search, category, tag, and publish status filters
   */
  @Get()
  async getBlogPosts(@Query() query: AdminBlogsQueryDto) {
    return this.blogsService.getBlogPosts(query);
  }

  /**
   * GET /api/v1/admin/blogs/:id
   * Get single blog post by UUID or Slug
   */
  @Get(':id')
  async getBlogPostById(@Param('id') id: string) {
    return this.blogsService.getBlogPostById(id);
  }

  /**
   * POST /api/v1/admin/blogs
   * Create a new blog post
   */
  @Post()
  async createBlogPost(@Body() dto: CreateBlogPostDto) {
    return this.blogsService.createBlogPost(dto);
  }

  /**
   * PATCH /api/v1/admin/blogs/:id
   * Edit blog post details
   */
  @Patch(':id')
  async updateBlogPost(
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.blogsService.updateBlogPost(id, dto);
  }

  /**
   * DELETE /api/v1/admin/blogs/:id
   * Soft-delete or permanently delete blog post
   */
  @Delete(':id')
  async deleteBlogPost(
    @Param('id') id: string,
    @Query('permanent') permanent?: string,
  ) {
    const isPermanent = permanent === 'true';
    return this.blogsService.deleteBlogPost(id, isPermanent);
  }
}
