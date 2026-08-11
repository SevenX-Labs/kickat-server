import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminBlogSortEnum,
  AdminBlogsQueryDto,
  BlogCategoriesQueryDto,
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  UpdateBlogCategoryDto,
  UpdateBlogPostDto,
} from './dto/admin-blog.dto';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BlogsService {
  private readonly logger = new Logger(BlogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a clean URL slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Calculates estimated read time from word count
   */
  private calculateReadTime(content: string): number {
    if (!content) return 1;
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  // ==========================================
  // BLOG POSTS
  // ==========================================

  /**
   * GET /api/v1/admin/blogs
   * List blog posts with search, category, tag, and publish status filters
   */
  async getBlogPosts(query: AdminBlogsQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.tag) {
      where.tags = { has: query.tag.trim() };
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { summary: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
        { tags: { has: s } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminBlogSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminBlogSortEnum.TITLE_ASC:
        orderBy = { title: 'asc' };
        break;
      case AdminBlogSortEnum.VIEW_COUNT_DESC:
        orderBy = { viewCount: 'desc' };
        break;
      case AdminBlogSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [posts, total, publishedCount, draftCount] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          blogCategory: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.count({ where: { ...where, isPublished: true } }),
      this.prisma.blogPost.count({ where: { ...where, isPublished: false } }),
    ]);

    const formattedPosts = posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      summary: p.summary,
      coverImage: p.coverImage,
      category: p.blogCategory?.name || p.category || 'Uncategorized',
      categoryId: p.categoryId,
      blogCategory: p.blogCategory,
      tags: p.tags,
      isPublished: p.isPublished,
      publishedAt: p.publishedAt,
      authorName: p.authorName,
      viewCount: p.viewCount,
      readTimeMinutes: p.readTimeMinutes,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        posts: formattedPosts,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalPosts: total,
          publishedCount,
          draftCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/blogs/:id
   * Get single blog post by UUID or Slug
   */
  async getBlogPostById(idOrSlug: string) {
    const isUuid = UUID_V4_REGEX.test(idOrSlug);

    const post = await this.prisma.blogPost.findFirst({
      where: isUuid
        ? { id: idOrSlug, deletedAt: null }
        : { slug: idOrSlug, deletedAt: null },
      include: {
        blogCategory: {
          select: { id: true, name: true, slug: true, description: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    return {
      success: true,
      data: {
        ...post,
        category: post.blogCategory?.name || post.category || 'Uncategorized',
      },
    };
  }

  /**
   * POST /api/v1/admin/blogs
   * Create a new blog post
   */
  async createBlogPost(dto: CreateBlogPostDto) {
    let baseSlug = dto.slug
      ? this.generateSlug(dto.slug)
      : this.generateSlug(dto.title);

    if (!baseSlug) {
      baseSlug = `post-${Date.now()}`;
    }

    // Check slug uniqueness
    const existing = await this.prisma.blogPost.findUnique({
      where: { slug: baseSlug },
    });

    if (existing) {
      baseSlug = `${baseSlug}-${Date.now().toString(36)}`;
    }

    // Validate category if supplied
    let categoryName = dto.category || null;
    if (dto.categoryId) {
      const cat = await this.prisma.blogCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!cat) {
        throw new BadRequestException('Specified blog category does not exist');
      }
      categoryName = cat.name;
    }

    const readTime = this.calculateReadTime(dto.content);

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug: baseSlug,
        content: dto.content,
        summary: dto.summary ? dto.summary.trim() : null,
        coverImage: dto.coverImage || null,
        category: categoryName,
        categoryId: dto.categoryId || null,
        tags: dto.tags || [],
        isPublished: dto.isPublished ?? true,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
        authorName: dto.authorName?.trim() || 'Kickat Editorial Team',
        readTimeMinutes: readTime,
      },
      include: {
        blogCategory: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return {
      success: true,
      message: 'Blog post created successfully',
      data: post,
    };
  }

  /**
   * PATCH /api/v1/admin/blogs/:id
   * Edit blog post
   */
  async updateBlogPost(id: string, dto: UpdateBlogPostDto) {
    const isUuid = UUID_V4_REGEX.test(id);
    const existing = await this.prisma.blogPost.findFirst({
      where: isUuid ? { id, deletedAt: null } : { slug: id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Blog post not found');
    }

    let nextSlug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      nextSlug = this.generateSlug(dto.slug);
      const conflict = await this.prisma.blogPost.findFirst({
        where: { slug: nextSlug, NOT: { id: existing.id } },
      });
      if (conflict) {
        throw new ConflictException(`Slug "${nextSlug}" is already in use`);
      }
    }

    let categoryName = existing.category;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        const cat = await this.prisma.blogCategory.findUnique({
          where: { id: dto.categoryId },
        });
        if (!cat) {
          throw new BadRequestException('Specified blog category does not exist');
        }
        categoryName = cat.name;
      } else {
        categoryName = null;
      }
    }

    const readTime = dto.content
      ? this.calculateReadTime(dto.content)
      : existing.readTimeMinutes;

    const updated = await this.prisma.blogPost.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        slug: nextSlug,
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.summary !== undefined && { summary: dto.summary?.trim() || null }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage || null }),
        category: categoryName,
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId || null }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...(dto.publishedAt !== undefined && {
          publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
        }),
        ...(dto.authorName !== undefined && { authorName: dto.authorName.trim() }),
        readTimeMinutes: readTime,
      },
      include: {
        blogCategory: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return {
      success: true,
      message: 'Blog post updated successfully',
      data: updated,
    };
  }

  /**
   * DELETE /api/v1/admin/blogs/:id
   * Soft-delete or permanently delete blog post
   */
  async deleteBlogPost(id: string, permanent = false) {
    const isUuid = UUID_V4_REGEX.test(id);
    const existing = await this.prisma.blogPost.findFirst({
      where: isUuid ? { id } : { slug: id },
    });

    if (!existing) {
      throw new NotFoundException('Blog post not found');
    }

    if (permanent) {
      await this.prisma.blogPost.delete({
        where: { id: existing.id },
      });
      return {
        success: true,
        message: 'Blog post permanently deleted',
      };
    }

    await this.prisma.blogPost.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      message: 'Blog post deleted successfully',
    };
  }

  // ==========================================
  // BLOG CATEGORIES
  // ==========================================

  /**
   * GET /api/v1/admin/blog-categories
   * List all blog categories with post count metrics
   */
  async getBlogCategories(query: BlogCategoriesQueryDto = {}) {
    const where: any = {
      deletedAt: null,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }

    const categories = await this.prisma.blogCategory.findMany({
      where,
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            posts: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    const formatted = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      order: c.order,
      isActive: c.isActive,
      postsCount: c._count.posts,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      success: true,
      data: {
        total: formatted.length,
        categories: formatted,
      },
    };
  }

  /**
   * POST /api/v1/admin/blog-categories
   * Create a new blog category
   */
  async createBlogCategory(dto: CreateBlogCategoryDto) {
    let slug = dto.slug ? this.generateSlug(dto.slug) : this.generateSlug(dto.name);
    if (!slug) slug = `cat-${Date.now()}`;

    const existingName = await this.prisma.blogCategory.findFirst({
      where: {
        OR: [{ name: { equals: dto.name.trim(), mode: 'insensitive' as const } }, { slug }],
        deletedAt: null,
      },
    });

    if (existingName) {
      throw new ConflictException('A blog category with this name or slug already exists');
    }

    const category = await this.prisma.blogCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl || null,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      success: true,
      message: 'Blog category created successfully',
      data: category,
    };
  }

  /**
   * PATCH /api/v1/admin/blog-categories/:id
   * Update blog category
   */
  async updateBlogCategory(id: string, dto: UpdateBlogCategoryDto) {
    const isUuid = UUID_V4_REGEX.test(id);
    const existing = await this.prisma.blogCategory.findFirst({
      where: isUuid ? { id, deletedAt: null } : { slug: id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Blog category not found');
    }

    let nextSlug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      nextSlug = this.generateSlug(dto.slug);
    } else if (dto.name && !dto.slug && dto.name !== existing.name) {
      nextSlug = this.generateSlug(dto.name);
    }

    if (dto.name || dto.slug) {
      const orConditions: any[] = [{ slug: nextSlug }];
      if (dto.name) {
        orConditions.push({ name: { equals: dto.name.trim(), mode: 'insensitive' as const } });
      }

      const conflict = await this.prisma.blogCategory.findFirst({
        where: {
          OR: orConditions,
          NOT: { id: existing.id },
          deletedAt: null,
        },
      });
      if (conflict) {
        throw new ConflictException('Another category with this name or slug already exists');
      }
    }

    const updated = await this.prisma.blogCategory.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        slug: nextSlug,
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return {
      success: true,
      message: 'Blog category updated successfully',
      data: updated,
    };
  }

  /**
   * DELETE /api/v1/admin/blog-categories/:id
   * Delete blog category
   */
  async deleteBlogCategory(id: string) {
    const isUuid = UUID_V4_REGEX.test(id);
    const existing = await this.prisma.blogCategory.findFirst({
      where: isUuid ? { id } : { slug: id },
    });

    if (!existing) {
      throw new NotFoundException('Blog category not found');
    }

    // Soft-delete category and detach posts
    await this.prisma.$transaction(async (tx) => {
      await tx.blogPost.updateMany({
        where: { categoryId: existing.id },
        data: { categoryId: null },
      });

      await tx.blogCategory.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
    });

    return {
      success: true,
      message: 'Blog category deleted successfully and posts detached',
    };
  }
}
