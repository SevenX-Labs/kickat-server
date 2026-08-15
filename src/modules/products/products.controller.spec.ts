import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('ProductsController', () => {
  let controller: ProductsController;

  const mockProductsService = {
    getProducts: jest.fn(),
    getProductById: jest.fn(),
    getProductVariants: jest.fn(),
    getProductMedia: jest.fn(),
    getProductImages: jest.fn(),
    getProductVideos: jest.fn(),
    getRelatedProducts: jest.fn(),
    getProductReviews: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mockProductsService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
