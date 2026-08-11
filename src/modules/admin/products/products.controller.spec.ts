import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import {
  AdminProductsQueryDto,
  BulkProductDeleteDto,
  BulkProductStatusDto,
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateProductStockDto,
} from './dto/admin-product.dto';
import { ProductStatusEnum } from '@prisma/client';

describe('Admin ProductsController', () => {
  let controller: ProductsController;
  let service: ProductsService;

  const mockProductsService = {
    getProducts: jest.fn(),
    getProductById: jest.fn(),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
    deleteProduct: jest.fn(),
    updateProductStatus: jest.fn(),
    bulkUpdateStatus: jest.fn(),
    bulkDelete: jest.fn(),
    updateStock: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getProducts should delegate to service', async () => {
    const expected = { success: true, data: { products: [] } };
    mockProductsService.getProducts.mockResolvedValue(expected);

    const query: AdminProductsQueryDto = { page: 1, limit: 10 };
    const result = await controller.getProducts(query);

    expect(result).toBe(expected);
    expect(mockProductsService.getProducts).toHaveBeenCalledWith(query);
  });

  it('getProductById should delegate to service', async () => {
    const expected = { success: true, data: { id: 'prod-1' } };
    mockProductsService.getProductById.mockResolvedValue(expected);

    const result = await controller.getProductById('prod-1');

    expect(result).toBe(expected);
    expect(mockProductsService.getProductById).toHaveBeenCalledWith('prod-1');
  });

  it('createProduct should delegate to service', async () => {
    const expected = { success: true, data: { id: 'prod-1' } };
    mockProductsService.createProduct.mockResolvedValue(expected);

    const dto: CreateProductDto = {
      name: 'Product 1',
      price: 100,
      categoryId: 'cat-1',
      imageUrl: 'https://example.com/img.jpg',
    };
    const result = await controller.createProduct(dto);

    expect(result).toBe(expected);
    expect(mockProductsService.createProduct).toHaveBeenCalledWith(dto);
  });

  it('updateProduct should delegate to service', async () => {
    const expected = { success: true, data: { id: 'prod-1' } };
    mockProductsService.updateProduct.mockResolvedValue(expected);

    const dto: UpdateProductDto = { price: 120 };
    const result = await controller.updateProduct('prod-1', dto);

    expect(result).toBe(expected);
    expect(mockProductsService.updateProduct).toHaveBeenCalledWith('prod-1', dto);
  });

  it('deleteProduct should delegate to service', async () => {
    const expected = { success: true, message: 'Deleted' };
    mockProductsService.deleteProduct.mockResolvedValue(expected);

    const result = await controller.deleteProduct('prod-1', false);

    expect(result).toBe(expected);
    expect(mockProductsService.deleteProduct).toHaveBeenCalledWith('prod-1', false);
  });

  it('updateProductStatus should delegate to service', async () => {
    const expected = { success: true, data: { status: ProductStatusEnum.INACTIVE } };
    mockProductsService.updateProductStatus.mockResolvedValue(expected);

    const dto: UpdateProductStatusDto = { status: ProductStatusEnum.INACTIVE };
    const result = await controller.updateProductStatus('prod-1', dto);

    expect(result).toBe(expected);
    expect(mockProductsService.updateProductStatus).toHaveBeenCalledWith('prod-1', dto);
  });

  it('bulkUpdateStatus should delegate to service', async () => {
    const expected = { success: true, data: { updatedCount: 2 } };
    mockProductsService.bulkUpdateStatus.mockResolvedValue(expected);

    const dto: BulkProductStatusDto = {
      productIds: ['p1', 'p2'],
      status: ProductStatusEnum.ACTIVE,
    };
    const result = await controller.bulkUpdateStatus(dto);

    expect(result).toBe(expected);
    expect(mockProductsService.bulkUpdateStatus).toHaveBeenCalledWith(dto);
  });

  it('bulkDelete should delegate to service', async () => {
    const expected = { success: true, data: { deletedCount: 2 } };
    mockProductsService.bulkDelete.mockResolvedValue(expected);

    const dto: BulkProductDeleteDto = { productIds: ['p1', 'p2'] };
    const result = await controller.bulkDelete(dto);

    expect(result).toBe(expected);
    expect(mockProductsService.bulkDelete).toHaveBeenCalledWith(dto);
  });

  it('updateStock should delegate to service', async () => {
    const expected = { success: true, data: { stock: 50 } };
    mockProductsService.updateStock.mockResolvedValue(expected);

    const dto: UpdateProductStockDto = { stock: 50 };
    const result = await controller.updateStock('prod-1', dto);

    expect(result).toBe(expected);
    expect(mockProductsService.updateStock).toHaveBeenCalledWith('prod-1', dto);
  });
});
