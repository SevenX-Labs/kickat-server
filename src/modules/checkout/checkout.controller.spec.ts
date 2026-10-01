import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('CheckoutController', () => {
  let controller: CheckoutController;

  const mockCheckoutService = {
    getCheckout: jest.fn(),
    validateAddress: jest.fn(),
    getPaymentMethods: jest.fn(),
    placeOrder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [{ provide: CheckoutService, useValue: mockCheckoutService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CheckoutController>(CheckoutController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
