import { Test, TestingModule } from '@nestjs/testing';
import { BlogsService } from './blogs.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminBlogSortEnum, CreateBlogCategoryDto, CreateBlogPostDto } from './dto/admin-blog.dto';

describe('Admin BlogsService', () => {
  let service: BlogsService;
  let prisma: any;

  const mockPrismaService = {
    blogPost: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    blogCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BlogsService>(BlogsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Blog Posts', () => {
    it('getBlogPosts should return paginated posts with summary counts', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          title: 'How to Care for Your Puppy',
          slug: 'how-to-care-for-your-puppy',
          summary: 'A complete guide to puppy nutrition and care.',
          isPublished: true,
          viewCount: 150,
          readTimeMinutes: 4,
          createdAt: new Date('2026-08-10'),
          blogCategory: { id: 'cat-1', name: 'Puppy Care', slug: 'puppy-care' },
        },
      ];

      prisma.blogPost.findMany.mockResolvedValue(mockPosts);
      prisma.blogPost.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // published
        .mockResolvedValueOnce(0); // draft

      const result = await service.getBlogPosts({
        page: 1,
        limit: 10,
        search: 'Puppy',
        sort: AdminBlogSortEnum.VIEW_COUNT_DESC,
      });

      expect(result.success).toBe(true);
      expect(result.data.posts.length).toBe(1);
      expect(result.data.posts[0].slug).toBe('how-to-care-for-your-puppy');
      expect(result.data.summary.totalPosts).toBe(1);
      expect(result.data.summary.publishedCount).toBe(1);
    });

    it('getBlogPostById should return single post by UUID or slug', async () => {
      const mockPost = {
        id: '11111111-1111-4111-a111-111111111111',
        title: 'Cat Nutrition',
        slug: 'cat-nutrition',
        content: 'Content here',
        blogCategory: { name: 'Cat Nutrition' },
      };

      prisma.blogPost.findFirst.mockResolvedValue(mockPost);

      const result = await service.getBlogPostById('cat-nutrition');

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Cat Nutrition');
    });

    it('getBlogPostById should throw NotFoundException if post not found', async () => {
      prisma.blogPost.findFirst.mockResolvedValue(null);

      await expect(service.getBlogPostById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('createBlogPost should create post with auto-slug and estimated read time', async () => {
      prisma.blogPost.findUnique.mockResolvedValue(null); // slug available
      prisma.blogPost.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'post-new', ...data, blogCategory: null }),
      );

      const dto: CreateBlogPostDto = {
        title: 'Top 5 Natural Dog Treats in 2026',
        content: 'Here are the best natural dog treats... '.repeat(100), // ~700 words -> ~4 mins
        summary: 'Review of top dog treats',
        tags: ['dogs', 'treats'],
      };

      const result = await service.createBlogPost(dto);

      expect(result.success).toBe(true);
      expect(result.data.slug).toBe('top-5-natural-dog-treats-in-2026');
      expect(result.data.readTimeMinutes).toBeGreaterThanOrEqual(1);
      expect(result.data.title).toBe('Top 5 Natural Dog Treats in 2026');
    });

    it('updateBlogPost should update fields and slug', async () => {
      const existing = {
        id: 'post-1',
        title: 'Old Title',
        slug: 'old-title',
        content: 'Old content',
        readTimeMinutes: 1,
      };

      prisma.blogPost.findFirst.mockResolvedValue(existing);
      prisma.blogPost.update.mockResolvedValue({
        ...existing,
        title: 'Updated Title',
        slug: 'old-title',
      });

      const result = await service.updateBlogPost('post-1', {
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Title');
    });

    it('deleteBlogPost should soft-delete post by default', async () => {
      prisma.blogPost.findFirst.mockResolvedValue({ id: 'post-1' });
      prisma.blogPost.update.mockResolvedValue({ id: 'post-1', deletedAt: new Date() });

      const result = await service.deleteBlogPost('post-1', false);

      expect(result.success).toBe(true);
      expect(prisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('deleteBlogPost should permanently delete post if permanent is true', async () => {
      prisma.blogPost.findFirst.mockResolvedValue({ id: 'post-1' });
      prisma.blogPost.delete.mockResolvedValue({ id: 'post-1' });

      const result = await service.deleteBlogPost('post-1', true);

      expect(result.success).toBe(true);
      expect(prisma.blogPost.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    });
  });

  describe('Blog Categories', () => {
    it('getBlogCategories should list categories with post counts', async () => {
      const mockCats = [
        {
          id: 'cat-1',
          name: 'Nutrition',
          slug: 'nutrition',
          description: 'Pet food advice',
          order: 1,
          isActive: true,
          _count: { posts: 5 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prisma.blogCategory.findMany.mockResolvedValue(mockCats);

      const result = await service.getBlogCategories({});

      expect(result.success).toBe(true);
      expect(result.data.categories.length).toBe(1);
      expect(result.data.categories[0].postsCount).toBe(5);
    });

    it('createBlogCategory should create category with unique slug', async () => {
      prisma.blogCategory.findFirst.mockResolvedValue(null);
      prisma.blogCategory.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'cat-new', ...data }),
      );

      const dto: CreateBlogCategoryDto = {
        name: 'Grooming & Health',
      };

      const result = await service.createBlogCategory(dto);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Grooming & Health');
      expect(result.data.slug).toBe('grooming-health');
    });

    it('createBlogCategory should throw ConflictException if category exists', async () => {
      prisma.blogCategory.findFirst.mockResolvedValue({ id: 'cat-1', name: 'Nutrition' });

      await expect(
        service.createBlogCategory({ name: 'Nutrition' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deleteBlogCategory should detach posts and soft-delete category', async () => {
      prisma.blogCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
      prisma.blogPost.updateMany.mockResolvedValue({ count: 2 });
      prisma.blogCategory.update.mockResolvedValue({ id: 'cat-1', deletedAt: new Date() });

      const result = await service.deleteBlogCategory('cat-1');

      expect(result.success).toBe(true);
      expect(prisma.blogPost.updateMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
        data: { categoryId: null },
      });
      expect(prisma.blogCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
