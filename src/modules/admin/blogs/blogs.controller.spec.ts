import { Test, TestingModule } from '@nestjs/testing';
import { BlogsController } from './blogs.controller';
import { BlogCategoriesController } from './blog-categories.controller';
import { BlogsService } from './blogs.service';
import {
  AdminBlogsQueryDto,
  BlogCategoriesQueryDto,
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  UpdateBlogCategoryDto,
  UpdateBlogPostDto,
} from './dto/admin-blog.dto';

describe('Admin BlogsController & BlogCategoriesController', () => {
  let blogsController: BlogsController;
  let categoriesController: BlogCategoriesController;
  let service: BlogsService;

  const mockBlogsService = {
    getBlogPosts: jest.fn(),
    getBlogPostById: jest.fn(),
    createBlogPost: jest.fn(),
    updateBlogPost: jest.fn(),
    deleteBlogPost: jest.fn(),
    getBlogCategories: jest.fn(),
    createBlogCategory: jest.fn(),
    updateBlogCategory: jest.fn(),
    deleteBlogCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlogsController, BlogCategoriesController],
      providers: [
        {
          provide: BlogsService,
          useValue: mockBlogsService,
        },
      ],
    }).compile();

    blogsController = module.get<BlogsController>(BlogsController);
    categoriesController = module.get<BlogCategoriesController>(BlogCategoriesController);
    service = module.get<BlogsService>(BlogsService);
    jest.clearAllMocks();
  });

  it('controllers should be defined', () => {
    expect(blogsController).toBeDefined();
    expect(categoriesController).toBeDefined();
  });

  describe('BlogsController', () => {
    it('getBlogPosts should delegate to service', async () => {
      const expected = { success: true, data: { posts: [] } };
      mockBlogsService.getBlogPosts.mockResolvedValue(expected);

      const query: AdminBlogsQueryDto = { page: 1, limit: 10 };
      const result = await blogsController.getBlogPosts(query);

      expect(result).toBe(expected);
      expect(mockBlogsService.getBlogPosts).toHaveBeenCalledWith(query);
    });

    it('getBlogPostById should delegate to service', async () => {
      const expected = { success: true, data: {} };
      mockBlogsService.getBlogPostById.mockResolvedValue(expected);

      const result = await blogsController.getBlogPostById('sample-slug');

      expect(result).toBe(expected);
      expect(mockBlogsService.getBlogPostById).toHaveBeenCalledWith('sample-slug');
    });

    it('createBlogPost should delegate to service', async () => {
      const expected = { success: true, data: {} };
      mockBlogsService.createBlogPost.mockResolvedValue(expected);

      const dto: CreateBlogPostDto = { title: 'New Post', content: 'Some content' };
      const result = await blogsController.createBlogPost(dto);

      expect(result).toBe(expected);
      expect(mockBlogsService.createBlogPost).toHaveBeenCalledWith(dto);
    });

    it('updateBlogPost should delegate to service', async () => {
      const expected = { success: true, data: {} };
      mockBlogsService.updateBlogPost.mockResolvedValue(expected);

      const dto: UpdateBlogPostDto = { title: 'Updated Title' };
      const result = await blogsController.updateBlogPost('post-1', dto);

      expect(result).toBe(expected);
      expect(mockBlogsService.updateBlogPost).toHaveBeenCalledWith('post-1', dto);
    });

    it('deleteBlogPost should delegate to service', async () => {
      const expected = { success: true, message: 'Deleted' };
      mockBlogsService.deleteBlogPost.mockResolvedValue(expected);

      const result = await blogsController.deleteBlogPost('post-1', 'false');

      expect(result).toBe(expected);
      expect(mockBlogsService.deleteBlogPost).toHaveBeenCalledWith('post-1', false);
    });
  });

  describe('BlogCategoriesController', () => {
    it('getBlogCategories should delegate to service', async () => {
      const expected = { success: true, data: { categories: [] } };
      mockBlogsService.getBlogCategories.mockResolvedValue(expected);

      const query: BlogCategoriesQueryDto = { search: 'Dog' };
      const result = await categoriesController.getBlogCategories(query);

      expect(result).toBe(expected);
      expect(mockBlogsService.getBlogCategories).toHaveBeenCalledWith(query);
    });

    it('createBlogCategory should delegate to service', async () => {
      const expected = { success: true, data: {} };
      mockBlogsService.createBlogCategory.mockResolvedValue(expected);

      const dto: CreateBlogCategoryDto = { name: 'Dog Care' };
      const result = await categoriesController.createBlogCategory(dto);

      expect(result).toBe(expected);
      expect(mockBlogsService.createBlogCategory).toHaveBeenCalledWith(dto);
    });

    it('updateBlogCategory should delegate to service', async () => {
      const expected = { success: true, data: {} };
      mockBlogsService.updateBlogCategory.mockResolvedValue(expected);

      const dto: UpdateBlogCategoryDto = { name: 'New Dog Care' };
      const result = await categoriesController.updateBlogCategory('cat-1', dto);

      expect(result).toBe(expected);
      expect(mockBlogsService.updateBlogCategory).toHaveBeenCalledWith('cat-1', dto);
    });

    it('deleteBlogCategory should delegate to service', async () => {
      const expected = { success: true, message: 'Deleted' };
      mockBlogsService.deleteBlogCategory.mockResolvedValue(expected);

      const result = await categoriesController.deleteBlogCategory('cat-1');

      expect(result).toBe(expected);
      expect(mockBlogsService.deleteBlogCategory).toHaveBeenCalledWith('cat-1');
    });
  });
});
