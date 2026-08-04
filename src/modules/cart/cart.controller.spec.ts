import { Test, TestingModule } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('CartController', () => {
  let controller: CartController;

  const mockCartService = {
    getCart: jest.fn(),
    addCartItem: jest.fn(),
    updateCartItem: jest.fn(),
    removeCartItem: jest.fn(),
    buyNow: jest.fn(),
    addGuestCartItem: jest.fn(),
    getGuestCart: jest.fn(),
    mergeCart: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: mockCartService }],
    }).compile();

    controller = module.get<CartController>(CartController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
