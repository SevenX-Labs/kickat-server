import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/admin-category.dto';

describe('Admin CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;
  let uploadService: any;

  const mockUploadService = {
    deleteFileByUrl: jest.fn().mockResolvedValue(true),
    deleteFilesByUrls: jest.fn().mockResolvedValue(1),
  };

  const mockPrismaService = {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: UploadService,
          useValue: mockUploadService,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);
    uploadService = module.get<UploadService>(UploadService);
    jest.clearAllMocks();
    prisma.category.findUnique.mockReset();
    prisma.category.findFirst.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCategories', () => {
    it('should return flat list of categories with counts and summary', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Dogs',
          slug: 'dogs',
          imageUrl: null,
          parentId: null,
          parent: null,
          isActive: true,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { products: 12, children: 3 },
        },
      ];

      prisma.category.findMany.mockResolvedValue(mockCategories);
      // count: total, root, sub, active, inactive
      prisma.category.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // root
        .mockResolvedValueOnce(0) // sub
        .mockResolvedValueOnce(1) // active
        .mockResolvedValueOnce(0); // inactive

      const result: any = await service.getCategories({ search: 'Dogs' });

      expect(result.success).toBe(true);
      expect(result.data.categories.length).toBe(1);
      expect(result.data.categories[0].productsCount).toBe(12);
      expect(result.data.categories[0].subcategoriesCount).toBe(3);
      expect(result.data.summary.totalCategories).toBe(1);
      expect(result.data.summary.activeCount).toBe(1);
    });
  });

  describe('getCategoryTree', () => {
    it('should return nested tree of parent categories and subcategories', async () => {
      const mockTree = [
        {
          id: 'cat-1',
          name: 'Dogs',
          slug: 'dogs',
          imageUrl: null,
          isActive: true,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          children: [
            {
              id: 'cat-2',
              name: 'Dog Food',
              slug: 'dog-food',
              imageUrl: null,
              parentId: 'cat-1',
              isActive: true,
              order: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
              _count: { products: 5 },
            },
          ],
          _count: { products: 10, children: 1 },
        },
      ];

      prisma.category.findMany.mockResolvedValue(mockTree);

      const result = await service.getCategoryTree();

      expect(result.success).toBe(true);
      expect(result.data.totalRootCategories).toBe(1);
      expect(result.data.tree[0].name).toBe('Dogs');
      expect(result.data.tree[0].children[0].name).toBe('Dog Food');
      expect(result.data.tree[0].children[0].productsCount).toBe(5);
    });
  });

  describe('getCategoryById', () => {
    it('should return single category with parent and children', async () => {
      const mockCategory = {
        id: '11111111-1111-4111-a111-111111111111',
        name: 'Cats',
        slug: 'cats',
        imageUrl: null,
        parentId: null,
        parent: null,
        isActive: true,
        order: 1,
        children: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { products: 8, children: 0 },
      };

      prisma.category.findFirst.mockResolvedValue(mockCategory);

      const result = await service.getCategoryById('11111111-1111-4111-a111-111111111111');

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Cats');
      expect(result.data.productsCount).toBe(8);
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.getCategoryById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCategory', () => {
    it('should create root category with unique slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      const createdMock = {
        id: 'cat-new',
        name: 'Fish & Aquatic',
        slug: 'fish-aquatic',
        parentId: null,
        isActive: true,
        order: 0,
      };
      prisma.category.create.mockResolvedValue(createdMock);

      const dto: CreateCategoryDto = {
        name: 'Fish & Aquatic',
      };

      const result = await service.createCategory(dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Category created successfully');
      expect(result.data.slug).toBe('fish-aquatic');
    });

    it('should create subcategory when valid parentId is given', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'parent-cat', deletedAt: null });
      prisma.category.findUnique.mockResolvedValue(null);

      const createdMock = {
        id: 'sub-cat-1',
        name: 'Fish Food',
        slug: 'fish-food',
        parentId: 'parent-cat',
        isActive: true,
        order: 0,
      };
      prisma.category.create.mockResolvedValue(createdMock);

      const dto: CreateCategoryDto = {
        name: 'Fish Food',
        parentId: 'parent-cat',
      };

      const result = await service.createCategory(dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Subcategory created successfully');
      expect(result.data.parentId).toBe('parent-cat');
    });

    it('should throw BadRequestException if parentId is invalid', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      const dto: CreateCategoryDto = {
        name: 'Subcategory',
        parentId: 'non-existent-parent',
      };

      await expect(service.createCategory(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCategory', () => {
    it('should update category fields', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', slug: 'old-slug', deletedAt: null });
      prisma.category.findUnique.mockResolvedValue(null);
      const updatedMock = {
        id: 'cat-1',
        name: 'Updated Name',
        slug: 'updated-name',
        isActive: true,
      };
      prisma.category.update.mockResolvedValue(updatedMock);

      const dto: UpdateCategoryDto = { name: 'Updated Name' };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Name');
    });

    it('should reject setting category as its own parent', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null });

      const dto: UpdateCategoryDto = { parentId: 'cat-1' };
      await expect(service.updateCategory('cat-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject circular parent hierarchy', async () => {
      prisma.category.findFirst
        .mockResolvedValueOnce({ id: 'cat-A', deletedAt: null }) // existing cat-A
        .mockResolvedValueOnce({ id: 'cat-B', parentId: 'cat-A', deletedAt: null }); // parent cat-B has cat-A as parent

      prisma.category.findUnique.mockResolvedValue({ parentId: 'cat-A' });

      const dto: UpdateCategoryDto = { parentId: 'cat-B' };
      await expect(service.updateCategory('cat-A', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('TEST 1: should preserve existing image when imageUrl is omitted', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg',
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { name: 'Updated Name' };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.not.objectContaining({ imageUrl: expect.anything() }),
        }),
      );
      expect(uploadService.deleteFileByUrl).not.toHaveBeenCalled();
    });

    it('TEST 2: should remove existing image and call deleteFileByUrl when imageUrl is null', async () => {
      const oldUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: oldUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: null };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: null }),
        }),
      );
      expect(uploadService.deleteFileByUrl).toHaveBeenCalledWith(oldUrl);
    });

    it('TEST 3: should replace image and delete old physical image when imageUrl is a new URL', async () => {
      const oldUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg';
      const newUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/new.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: oldUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: newUrl };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: newUrl }),
        }),
      );
      expect(uploadService.deleteFileByUrl).toHaveBeenCalledWith(oldUrl);
    });

    it('TEST 4: should NOT delete image when imageUrl is unchanged', async () => {
      const oldUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: oldUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: oldUrl };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: oldUrl }),
        }),
      );
      expect(uploadService.deleteFileByUrl).not.toHaveBeenCalled();
    });

    it('TEST 5: should normalize empty string imageUrl to null and delete old image', async () => {
      const oldUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: oldUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: '' };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: null }),
        }),
      );
      expect(uploadService.deleteFileByUrl).toHaveBeenCalledWith(oldUrl);
    });

    it('TEST 6: should NOT call deleteFileByUrl when replacing if existing category had no image', async () => {
      const newUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/new.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: null,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: newUrl };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: newUrl }),
        }),
      );
      expect(uploadService.deleteFileByUrl).not.toHaveBeenCalled();
    });

    it('TEST 7: should call deleteFileByUrl with external URL so uploadService safety protects it', async () => {
      const externalUrl = 'https://images.unsplash.com/photo-1543466835-00a7907e9de1';
      const newUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/new.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: externalUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockImplementation(({ data }) => Promise.resolve({ id: 'cat-1', ...data }));

      const dto: UpdateCategoryDto = { imageUrl: newUrl };
      const result = await service.updateCategory('cat-1', dto);

      expect(result.success).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ imageUrl: newUrl }),
        }),
      );
      expect(uploadService.deleteFileByUrl).toHaveBeenCalledWith(externalUrl);
    });

    it('should NOT delete old image if database update fails', async () => {
      const oldUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/old.jpg';
      const newUrl = 'https://supabase.co/storage/v1/object/public/upload/categories/new.jpg';
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        slug: 'dogs',
        imageUrl: oldUrl,
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.update.mockRejectedValue(new Error('Database error'));

      const dto: UpdateCategoryDto = { imageUrl: newUrl };
      await expect(service.updateCategory('cat-1', dto)).rejects.toThrow('Database error');

      expect(uploadService.deleteFileByUrl).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('should prevent deletion if products depend on the category', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null });
      prisma.product.count.mockResolvedValue(5); // 5 dependent products

      await expect(service.deleteCategory('cat-1', false)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('should prevent deletion if subcategories exist under the category', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null });
      prisma.product.count.mockResolvedValue(0); // 0 products
      prisma.category.count.mockResolvedValue(2); // 2 subcategories

      await expect(service.deleteCategory('cat-1', false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should soft-delete category if no dependencies exist', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null, imageUrl: 'https://supabase/upload/category/cat-1.png' });
      prisma.product.count.mockResolvedValue(0);
      prisma.category.count.mockResolvedValue(0);
      prisma.category.update.mockResolvedValue({});

      const result = await service.deleteCategory('cat-1', false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Category soft-deleted successfully');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(uploadService.deleteFileByUrl).toHaveBeenCalledWith('https://supabase/upload/category/cat-1.png');
    });

    it('should permanently delete category if permanent is true and no dependencies', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null });
      prisma.product.count.mockResolvedValue(0);
      prisma.category.count.mockResolvedValue(0);
      prisma.category.delete.mockResolvedValue({});

      const result = await service.deleteCategory('cat-1', true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Category permanently deleted');
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });
  });

  describe('updateStatus', () => {
    it('should activate/deactivate category', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: null });
      prisma.category.update.mockResolvedValue({
        id: 'cat-1',
        name: 'Dogs',
        isActive: false,
        updatedAt: new Date(),
      });

      const result = await service.updateStatus('cat-1', { isActive: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Category deactivated successfully');
    });
  });

  describe('reorderCategories', () => {
    it('should update display order across categories in a transaction', async () => {
      prisma.category.update.mockResolvedValue({});

      const result = await service.reorderCategories({
        items: [
          { id: 'cat-1', order: 1 },
          { id: 'cat-2', order: 2 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Categories reordered successfully');
      expect(result.data.updatedCount).toBe(2);
    });
  });
});
