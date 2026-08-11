import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AdminProductSortEnum,
  AdminProductsQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/admin-product.dto';
import { ProductStatusEnum } from '@prisma/client';

describe('Admin ProductsService', () => {
  let service: ProductsService;
  let prisma: any;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productVariant: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    productMedia: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProducts', () => {
    it('should return paginated products with inventory summary and filters', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          name: 'Super Dog Food',
          slug: 'super-dog-food',
          price: 499,
          stock: 25,
          status: ProductStatusEnum.ACTIVE,
          category: { id: 'cat-1', name: 'Food', slug: 'food' },
          variants: [],
          media: [],
          _count: { reviews: 5, variants: 0 },
        },
      ];

      prisma.product.findMany.mockResolvedValue(mockProducts);
      // count: total, active, draft, inactive, lowStock, outOfStock
      prisma.product.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // active
        .mockResolvedValueOnce(0) // draft
        .mockResolvedValueOnce(0) // inactive
        .mockResolvedValueOnce(0) // lowStock
        .mockResolvedValueOnce(0); // outOfStock

      const query: AdminProductsQueryDto = {
        page: 1,
        limit: 10,
        search: 'Super',
        status: ProductStatusEnum.ACTIVE,
        sort: AdminProductSortEnum.PRICE_ASC,
      };

      const result = await service.getProducts(query);

      expect(result.success).toBe(true);
      expect(result.data.products).toEqual(mockProducts);
      expect(result.data.pagination.total).toBe(1);
      expect(result.data.pagination.page).toBe(1);
      expect(result.data.pagination.totalPages).toBe(1);
      expect(result.data.summary.activeCount).toBe(1);
      expect(prisma.product.findMany).toHaveBeenCalled();
    });
  });

  describe('getProductById', () => {
    it('should return single product by UUID', async () => {
      const mockProduct = {
        id: '11111111-1111-4111-a111-111111111111',
        name: 'Cat Scratcher',
        slug: 'cat-scratcher',
        category: { id: 'cat-2', name: 'Toys' },
        variants: [],
        media: [],
        reviews: [],
        _count: { reviews: 0, variants: 0, wishlistItems: 0, cartItems: 0 },
      };

      prisma.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.getProductById('11111111-1111-4111-a111-111111111111');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockProduct);
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.getProductById('11111111-1111-4111-a111-111111111111'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProduct', () => {
    it('should create a product with variants and media in transaction', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Dog Food' });
      prisma.product.findUnique.mockResolvedValue(null); // slug is unique

      const createdMock = {
        id: 'new-prod-id',
        name: 'Organic Puppy Food',
        slug: 'organic-puppy-food',
        price: 899,
        stock: 50,
        categoryId: 'cat-1',
        imageUrl: 'https://example.com/image.jpg',
        variants: [{ id: 'var-1', name: '1kg', price: 899, stock: 50 }],
        media: [{ id: 'med-1', url: 'https://example.com/image.jpg', order: 0 }],
      };

      prisma.product.create.mockResolvedValue(createdMock);

      const dto: CreateProductDto = {
        name: 'Organic Puppy Food',
        price: 899,
        stock: 50,
        categoryId: 'cat-1',
        imageUrl: 'https://example.com/image.jpg',
        variants: [{ name: '1kg', price: 899, stock: 50 }],
        media: [{ url: 'https://example.com/image.jpg' }],
      };

      const result = await service.createProduct(dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Product created successfully');
      expect(result.data).toEqual(createdMock);
    });

    it('should throw BadRequestException if categoryId does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      const dto: CreateProductDto = {
        name: 'Test Product',
        price: 100,
        categoryId: 'non-existent-cat',
        imageUrl: 'https://example.com/image.jpg',
      };

      await expect(service.createProduct(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateProduct', () => {
    it('should update product fields and sync variants and media', async () => {
      const existingProduct = {
        id: 'prod-1',
        name: 'Old Name',
        slug: 'old-name',
        deletedAt: null,
        variants: [{ id: 'var-1' }],
        media: [],
      };

      prisma.product.findFirst.mockResolvedValue(existingProduct);
      prisma.product.findUnique.mockResolvedValue(null); // for ensureUniqueSlug check
      prisma.product.update.mockResolvedValue({});
      prisma.productVariant.deleteMany.mockResolvedValue({ count: 0 });
      prisma.productVariant.update.mockResolvedValue({});
      prisma.productVariant.create.mockResolvedValue({});

      const updatedMock = {
        id: 'prod-1',
        name: 'New Name',
        slug: 'new-name',
        price: 999,
        variants: [{ id: 'var-1', name: 'Updated Var', price: 999 }],
      };
      prisma.product.findUnique.mockResolvedValue(updatedMock);

      const dto: UpdateProductDto = {
        name: 'New Name',
        price: 999,
        variants: [
          { id: 'var-1', name: 'Updated Var', price: 999 },
          { name: 'Brand New Var', price: 1200, stock: 10 },
        ],
      };

      const result = await service.updateProduct('prod-1', dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Product updated successfully');
      expect(result.data).toEqual(updatedMock);
    });

    it('should throw NotFoundException if product to update does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProduct('invalid-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProduct', () => {
    it('should soft-delete product by setting deletedAt timestamp', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1', deletedAt: null });
      prisma.product.update.mockResolvedValue({});

      const result = await service.deleteProduct('prod-1', false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Product soft-deleted successfully');
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should permanently delete product if permanent is true', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1', deletedAt: null });
      prisma.product.delete.mockResolvedValue({});

      const result = await service.deleteProduct('prod-1', true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Product permanently deleted');
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
    });
  });

  describe('updateProductStatus', () => {
    it('should update status of a single product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', deletedAt: null });
      prisma.product.update.mockResolvedValue({
        id: 'prod-1',
        name: 'Product 1',
        slug: 'product-1',
        status: ProductStatusEnum.INACTIVE,
        updatedAt: new Date(),
      });

      const result = await service.updateProductStatus('prod-1', {
        status: ProductStatusEnum.INACTIVE,
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(ProductStatusEnum.INACTIVE);
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update status for multiple products', async () => {
      prisma.product.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.bulkUpdateStatus({
        productIds: ['id-1', 'id-2', 'id-3'],
        status: ProductStatusEnum.ACTIVE,
      });

      expect(result.success).toBe(true);
      expect(result.data.updatedCount).toBe(3);
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['id-1', 'id-2', 'id-3'] },
          deletedAt: null,
        },
        data: { status: ProductStatusEnum.ACTIVE },
      });
    });
  });

  describe('bulkDelete', () => {
    it('should bulk soft-delete products', async () => {
      prisma.product.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkDelete({
        productIds: ['id-1', 'id-2'],
        permanent: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.deletedCount).toBe(2);
      expect(prisma.product.updateMany).toHaveBeenCalled();
    });
  });

  describe('updateStock', () => {
    it('should update stock for product and variants', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', deletedAt: null });
      prisma.product.update.mockResolvedValue({});
      prisma.productVariant.update.mockResolvedValue({});
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        stock: 100,
        variants: [{ id: 'var-1', stock: 50 }],
      });

      const result = await service.updateStock('prod-1', {
        stock: 100,
        variantStocks: [{ variantId: 'var-1', stock: 50 }],
      });

      expect(result.success).toBe(true);
      expect(result.data?.stock).toBe(100);
    });
  });
});
