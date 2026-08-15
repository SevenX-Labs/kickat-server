import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayService } from '../payments/razorpay.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
  OrderStatusEnum,
} from '@prisma/client';
import { CheckoutPaymentMethodEnum } from './dto/place-order.dto';
import { PaymentMethodType } from '../payments/dto/create-payment-order.dto';
import { CancelReasonEnum } from '../orders/dto/cancel-order.dto';
import { ReturnReasonEnum } from '../orders/dto/return-order.dto';

describe('Checkout, Payments & Orders Concurrency & Idempotency Audit', () => {
  let checkoutService: CheckoutService;
  let paymentsService: PaymentsService;
  let ordersService: OrdersService;
  let prisma: any;
  let razorpayService: any;

  const mockUserA = '11111111-1111-4111-8111-111111111111';
  const mockUserB = '22222222-2222-4222-8222-222222222222';
  const mockOrderId = '33333333-3333-4333-8333-333333333333';
  const mockPaymentId = '44444444-4444-4444-8444-444444444444';
  const mockAddressId = '55555555-5555-4555-8555-555555555555';
  const mockIdempotencyKey = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      cartItem: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      address: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      stockReservation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderReturn: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    razorpayService = {
      getKeyId: jest.fn().mockReturnValue('rzp_test_key_123'),
      createRazorpayOrder: jest.fn().mockResolvedValue({
        id: 'order_rzp_mock_123',
        amount: 50000,
        currency: 'INR',
      }),
      verifySignature: jest.fn().mockReturnValue(true),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        PaymentsService,
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RazorpayService, useValue: razorpayService },
      ],
    }).compile();

    checkoutService = module.get<CheckoutService>(CheckoutService);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    ordersService = module.get<OrdersService>(OrdersService);
  });

  describe('1. Order Placement Idempotency & Concurrency', () => {
    it('should return the identical cached order when same user repeats request with same Idempotency-Key', async () => {
      const existingOrder = {
        id: mockOrderId,
        orderNumber: 'ORD-12345',
        userId: mockUserA,
        orderStatus: OrderStatusEnum.PLACED,
        grandTotal: 999,
        idempotencyKey: mockIdempotencyKey,
      };

      prisma.order.findUnique.mockResolvedValue(existingOrder);

      const res = await checkoutService.placeOrder(
        mockUserA,
        mockIdempotencyKey,
        {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        },
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('idempotent response');
      expect(res.orderId).toBe(mockOrderId);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('should reject when User B attempts to use an Idempotency-Key already used by User A', async () => {
      const existingOrder = {
        id: mockOrderId,
        orderNumber: 'ORD-12345',
        userId: mockUserA,
        orderStatus: OrderStatusEnum.PLACED,
        grandTotal: 999,
        idempotencyKey: mockIdempotencyKey,
      };

      prisma.order.findUnique.mockResolvedValue(existingOrder);

      await expect(
        checkoutService.placeOrder(mockUserB, mockIdempotencyKey, {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle simultaneous concurrent order creation race (P2002) and return idempotent response', async () => {
      // First findUnique returns null (both requests enter transaction concurrently)
      prisma.order.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: mockOrderId,
          orderNumber: 'ORD-CONCURRENT-1',
          userId: mockUserA,
          orderStatus: OrderStatusEnum.PLACED,
          grandTotal: 1200,
        });

      prisma.stockReservation.findFirst.mockResolvedValue({
        id: 'res_1',
        userId: mockUserA,
        isFulfilled: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      prisma.cartItem.findMany.mockResolvedValue([
        {
          productId: 'prod_1',
          quantity: 1,
          product: { id: 'prod_1', name: 'Shoes', price: 1200, stock: 5 },
          variant: null,
        },
      ]);

      prisma.address.findFirst.mockResolvedValue({
        id: mockAddressId,
        userId: mockUserA,
      });

      // Simultaneous insert throws P2002 unique constraint violation
      prisma.$transaction.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`idempotencyKey`)',
      });

      const res = await checkoutService.placeOrder(
        mockUserA,
        mockIdempotencyKey,
        {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        },
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('idempotent response');
      expect(res.orderId).toBe(mockOrderId);
    });
  });

  describe('2. Inventory / Stock Concurrency Protection', () => {
    it('should atomically deduct stock for base product and throw ConflictException if stock runs out', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.stockReservation.findFirst.mockResolvedValue({
        id: 'res_1',
        userId: mockUserA,
        isFulfilled: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      prisma.cartItem.findMany.mockResolvedValue([
        {
          productId: 'prod_1',
          variantId: null,
          quantity: 2,
          product: { id: 'prod_1', name: 'T-Shirt', price: 500, stock: 1 },
          variant: null,
        },
      ]);

      prisma.address.findFirst.mockResolvedValue({
        id: mockAddressId,
        userId: mockUserA,
      });

      // Product updateMany returns count: 0 (insufficient stock at DB level)
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        checkoutService.placeOrder(mockUserA, mockIdempotencyKey, {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod_1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
    });

    it('should atomically deduct stock for variant if item has variantId', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.stockReservation.findFirst.mockResolvedValue({
        id: 'res_1',
        userId: mockUserA,
        isFulfilled: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      prisma.cartItem.findMany.mockResolvedValue([
        {
          productId: 'prod_1',
          variantId: 'var_red_l',
          quantity: 1,
          product: { id: 'prod_1', name: 'Jersey', price: 900, stock: 10 },
          variant: { id: 'var_red_l', name: 'Red L', price: 900, stock: 2 },
        },
      ]);

      prisma.address.findFirst.mockResolvedValue({
        id: mockAddressId,
        userId: mockUserA,
      });

      prisma.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.create.mockResolvedValue({
        id: mockOrderId,
        orderNumber: 'ORD-VAR-1',
        orderStatus: OrderStatusEnum.PLACED,
        grandTotal: 900,
      });

      const res = await checkoutService.placeOrder(
        mockUserA,
        mockIdempotencyKey,
        {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        },
      );

      expect(res.success).toBe(true);
      expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'var_red_l', stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      });
      // Ensure product base stock was NOT decremented when variant stock was decremented
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('3. Payment Idempotency & State Machine Transitions', () => {
    it('should reject payment creation if order is already completed/paid', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        paymentStatus: PaymentStatusEnum.COMPLETED,
        orderStatus: OrderStatusEnum.PLACED,
      });

      await expect(
        paymentsService.createPaymentOrder(mockUserA, mockIdempotencyKey, {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject payment retry if order is cancelled', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        paymentStatus: PaymentStatusEnum.FAILED,
        orderStatus: OrderStatusEnum.CANCELLED,
        createdAt: new Date(),
      });

      await expect(
        paymentsService.retryPayment(mockUserA, mockIdempotencyKey, {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should atomically confirm COD payment and prevent race with double-confirmation', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        paymentMethod: PaymentMethodEnum.COD,
        paymentStatus: PaymentStatusEnum.PENDING,
        orderStatus: OrderStatusEnum.PLACED,
        grandTotal: 1500,
      });

      // UpdateMany returns count: 0 if concurrent confirmation already won
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        paymentsService.confirmCod(mockUserA, mockIdempotencyKey, {
          orderId: mockOrderId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject User B trying to confirm COD for User A order (Authorization)', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue(null); // User B cannot find User A's order

      await expect(
        paymentsService.confirmCod(mockUserB, mockIdempotencyKey, {
          orderId: mockOrderId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. Webhook Concurrency & Deduplication', () => {
    it('should handle duplicate concurrent webhook delivery (P2002 on eventId) gracefully', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      // Concurrent duplicate insert throws P2002
      prisma.webhookLog.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`eventId`)',
      });

      const res = await paymentsService.handleWebhook(
        'mock_sig_123',
        {
          id: 'evt_dup_123',
          event: 'payment.captured',
          payload: {},
        },
        Buffer.from('{}'),
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('already processed');
    });

    it('should fulfill stock reservation on payment.captured event', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        userId: mockUserA,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_123',
      });

      const res = await paymentsService.handleWebhook(
        'mock_sig_123',
        {
          id: 'evt_cap_123',
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_rzp_123',
                order_id: 'order_rzp_123',
                amount: 50000,
              },
            },
          },
        },
        Buffer.from('{}'),
      );

      expect(res.success).toBe(true);
      expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserA, isFulfilled: false },
        data: { isFulfilled: true },
      });
    });
  });

  describe('5. Order Cancellation & Stock Restoration Concurrency', () => {
    it('should restore stock atomically when cancelling order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        orderStatus: OrderStatusEnum.PLACED,
        items: [
          { productId: 'prod_1', variantId: null, quantity: 2 },
          { productId: 'prod_2', variantId: 'var_2', quantity: 1 },
        ],
      });

      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const res = await ordersService.cancelOrder(mockUserA, mockOrderId, {
        reason: CancelReasonEnum.CHANGED_MIND,
      });

      expect(res.success).toBe(true);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod_1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var_2' },
        data: { stock: { increment: 1 } },
      });
    });

    it('should prevent double cancellation and double stock restoration on concurrent requests', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        orderStatus: OrderStatusEnum.PLACED,
        items: [{ productId: 'prod_1', variantId: null, quantity: 2 }],
      });

      // Second concurrent request finds orderStatus no longer cancellable
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        ordersService.cancelOrder(mockUserA, mockOrderId, {
          reason: CancelReasonEnum.OTHER,
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('6. Return Concurrency Protection', () => {
    it('should allow return for DELIVERED order within 7 days', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        orderStatus: OrderStatusEnum.DELIVERED,
        deliveryDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        items: [{ id: 'item_1', orderId: mockOrderId }],
        returns: [],
      });

      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.orderReturn.create.mockResolvedValue({ id: 'ret_1' });

      const res = await ordersService.returnOrder(mockUserA, mockOrderId, {
        items: [{ orderItemId: 'item_1', reason: ReturnReasonEnum.DAMAGED }],
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('RETURN_INITIATED');
    });

    it('should reject simultaneous duplicate returns on the same order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserA,
        orderStatus: OrderStatusEnum.DELIVERED,
        deliveryDate: new Date(),
        items: [{ id: 'item_1', orderId: mockOrderId }],
        returns: [],
      });

      // updateMany returns count: 0 if concurrent request already initiated return
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        ordersService.returnOrder(mockUserA, mockOrderId, {
          items: [{ orderItemId: 'item_1', reason: ReturnReasonEnum.DAMAGED }],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
