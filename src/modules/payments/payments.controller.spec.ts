import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentMethodType } from './dto/create-payment-order.dto';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockOrderId = '22222222-2222-4222-8222-222222222222';
  const mockPaymentId = '33333333-3333-4333-8333-333333333333';
  const mockIdempotencyKey = '44444444-4444-4444-8444-444444444444';

  beforeEach(async () => {
    service = {
      createPaymentOrder: jest.fn().mockResolvedValue({
        success: true,
        paymentId: mockPaymentId,
      }),
      verifyPayment: jest.fn().mockResolvedValue({
        success: true,
        status: 'COMPLETED',
      }),
      retryPayment: jest.fn().mockResolvedValue({
        success: true,
        paymentId: mockPaymentId,
      }),
      getPaymentById: jest.fn().mockResolvedValue({
        success: true,
        payment: { id: mockPaymentId },
      }),
      confirmCod: jest.fn().mockResolvedValue({
        success: true,
        message: 'COD payment confirmed successfully',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call createPaymentOrder', async () => {
    const dto = {
      orderId: mockOrderId,
      paymentMethod: PaymentMethodType.UPI,
    };
    const res = await controller.createPaymentOrder(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(service.createPaymentOrder).toHaveBeenCalledWith(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(res.success).toBe(true);
  });

  it('should call verifyPayment', async () => {
    const dto = {
      orderId: mockOrderId,
      razorpayOrderId: 'order_123',
      razorpayPaymentId: 'pay_123',
      signature: 'sig_123',
    };
    const res = await controller.verifyPayment(mockUserId, dto);
    expect(service.verifyPayment).toHaveBeenCalledWith(mockUserId, dto);
    expect(res.success).toBe(true);
  });

  it('should call retryPayment', async () => {
    const dto = {
      orderId: mockOrderId,
      paymentMethod: PaymentMethodType.UPI,
    };
    const res = await controller.retryPayment(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(service.retryPayment).toHaveBeenCalledWith(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(res.success).toBe(true);
  });

  it('should call getPaymentById', async () => {
    const res = await controller.getPaymentById(mockUserId, mockPaymentId);
    expect(service.getPaymentById).toHaveBeenCalledWith(
      mockUserId,
      mockPaymentId,
    );
    expect(res.success).toBe(true);
  });

  it('should call confirmCod', async () => {
    const dto = { orderId: mockOrderId };
    const res = await controller.confirmCod(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(service.confirmCod).toHaveBeenCalledWith(
      mockUserId,
      mockIdempotencyKey,
      dto,
    );
    expect(res.success).toBe(true);
  });
});
