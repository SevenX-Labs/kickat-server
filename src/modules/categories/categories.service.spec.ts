import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductSortEnum } from './dto/category-products-query.dto';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  const mockCategory = {
    id: 'cat-uuid-1',
    name: 'Dog Food',
    slug: 'dog-food',
    imageUrl: 'https://example.com/cat.jpg',
    parentId: null,
    isActive: true,
    order: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProduct = {
    id: 'prod-uuid-1',
    name: 'Premium Kibble',
    slug: 'premium-kibble',
    description: 'Tasty kibble for dogs',
    price: 49.99,
    discountPrice: null,
    stock: 50,
    rating: 4.8,
    reviewsCount: 12,
    brand: 'DogChoice',
    petSpecies: 'DOG',
    dietaryPreference: 'NON_VEG',
    categoryId: 'cat-uuid-1',
    isTrending: true,
    isBestSeller: false,
    imageUrl: 'https://example.com/kibble.jpg',
    images: [],
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    category: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCategories', () => {
    it('should return all active flat categories', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.getCategories();

      expect(result).toEqual({
        success: true,
        categories: [mockCategory],
      });
      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null },
        orderBy: { order: 'asc' },
      });
    });
  });

  describe('getCategoryTree', () => {
    it('should return category tree starting with root categories', async () => {
      const mockTreeCategory = {
        ...mockCategory,
        children: [],
      };
      mockPrismaService.category.findMany.mockResolvedValue([mockTreeCategory]);

      const result = await service.getCategoryTree();

      expect(result).toEqual({
        success: true,
        categories: [mockTreeCategory],
      });
      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null, parentId: null },
        include: {
          children: {
            where: { isActive: true, deletedAt: null },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      });
    });
  });

  describe('getCategoryById', () => {
    it('should return category by UUID', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [],
      });

      const result = await service.getCategoryById('123e4567-e89b-12d3-a456-426614174000');

      expect(result.success).toBe(true);
      expect(result.category.id).toBe(mockCategory.id);
      expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174000', isActive: true, deletedAt: null },
        include: { children: { where: { isActive: true, deletedAt: null } } },
      });
    });

    it('should return category by slug if not a UUID', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [],
      });

      const result = await service.getCategoryById('dog-food');

      expect(result.success).toBe(true);
      expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
        where: { slug: 'dog-food', isActive: true, deletedAt: null },
        include: { children: { where: { isActive: true, deletedAt: null } } },
      });
    });

    it('should throw NotFoundException if category does not exist', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null);

      await expect(service.getCategoryById('unknown-cat')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCategoryProducts', () => {
    it('should return paginated products for a category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);
      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.product.count.mockResolvedValue(1);

      const query = { page: 1, limit: 10, sort: ProductSortEnum.NEWEST };
      const result = await service.getCategoryProducts(mockCategory.id, query);

      expect(result).toEqual({
        success: true,
        category: {
          id: mockCategory.id,
          name: mockCategory.name,
          slug: mockCategory.slug,
        },
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        products: [mockProduct],
      });
    });

    it('should throw NotFoundException if category is missing', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null);

      await expect(
        service.getCategoryProducts('missing-id', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
