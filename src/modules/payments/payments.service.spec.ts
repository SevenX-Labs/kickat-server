import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { PaymentMethodType } from './dto/create-payment-order.dto';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let razorpayService: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockOrderId = '22222222-2222-4222-8222-222222222222';
  const mockPaymentId = '33333333-3333-4333-8333-333333333333';
  const mockIdempotencyKey = '44444444-4444-4444-8444-444444444444';

  const mockOrder = {
    id: mockOrderId,
    orderNumber: 'ORD-12345',
    userId: mockUserId,
    grandTotal: 1500,
    paymentMethod: PaymentMethodEnum.UPI,
    paymentStatus: PaymentStatusEnum.PENDING,
    orderStatus: 'PLACED',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockReservation: {
        updateMany: jest.fn(),
      },
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    razorpayService = {
      getKeyId: jest.fn().mockReturnValue('rzp_test_mock_key'),
      createRazorpayOrder: jest.fn().mockResolvedValue({
        id: 'order_mock_razorpay_123',
        amount: 150000,
        currency: 'INR',
      }),
      verifySignature: jest.fn().mockReturnValue(true),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RazorpayService, useValue: razorpayService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentOrder', () => {
    it('should throw BadRequestException if idempotency key is missing or invalid', async () => {
      await expect(
        service.createPaymentOrder(mockUserId, 'invalid-key', {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if orderId is invalid UUID', async () => {
      await expect(
        service.createPaymentOrder(mockUserId, mockIdempotencyKey, {
          orderId: 'invalid-uuid',
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return existing payment if idempotency key matched', async () => {
      const existing = {
        id: mockPaymentId,
        orderId: mockOrderId,
        userId: mockUserId,
        razorpayOrderId: 'order_mock_razorpay_123',
        amount: 1500,
        currency: 'INR',
        status: PaymentStatusEnum.PENDING,
        paymentMethod: PaymentMethodEnum.UPI,
      };
      prisma.payment.findUnique.mockResolvedValue(existing);

      const res = await service.createPaymentOrder(
        mockUserId,
        mockIdempotencyKey,
        {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        },
      );

      expect(res.success).toBe(true);
      expect(res.paymentId).toBe(mockPaymentId);
    });

    it('should throw NotFoundException if order is not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createPaymentOrder(mockUserId, mockIdempotencyKey, {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if order is already paid', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      });

      await expect(
        service.createPaymentOrder(mockUserId, mockIdempotencyKey, {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create payment and razorpay order successfully', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.payment.create.mockResolvedValue({
        id: mockPaymentId,
        amount: 1500,
        currency: 'INR',
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_mock_razorpay_123',
      });

      const res = await service.createPaymentOrder(
        mockUserId,
        mockIdempotencyKey,
        {
          orderId: mockOrderId,
          paymentMethod: PaymentMethodType.UPI,
        },
      );

      expect(res.success).toBe(true);
      expect(res.razorpayOrderId).toBe('order_mock_razorpay_123');
    });
  });

  describe('verifyPayment', () => {
    it('should verify payment successfully', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        status: PaymentStatusEnum.PENDING,
      });
      prisma.payment.update.mockResolvedValue({
        id: mockPaymentId,
        status: PaymentStatusEnum.COMPLETED,
      });

      const res = await service.verifyPayment(mockUserId, {
        orderId: mockOrderId,
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_123',
        signature: 'valid_sig_123',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(PaymentStatusEnum.COMPLETED);
    });

    it('should throw ConflictException if signature is invalid', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        status: PaymentStatusEnum.PENDING,
      });
      razorpayService.verifySignature.mockReturnValue(false);

      await expect(
        service.verifyPayment(mockUserId, {
          orderId: mockOrderId,
          razorpayOrderId: 'order_123',
          razorpayPaymentId: 'pay_123',
          signature: 'invalid_sig',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('retryPayment', () => {
    it('should retry payment and return razorpay order', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.payment.count.mockResolvedValue(1);
      prisma.payment.create.mockResolvedValue({
        id: mockPaymentId,
        amount: 1500,
        currency: 'INR',
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_mock_razorpay_123',
      });

      const res = await service.retryPayment(mockUserId, mockIdempotencyKey, {
        orderId: mockOrderId,
        paymentMethod: PaymentMethodType.UPI,
      });

      expect(res.success).toBe(true);
      expect(res.razorpayOrderId).toBe('order_mock_razorpay_123');
    });
  });

  describe('getPaymentById', () => {
    it('should return payment by id', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        amount: 1500,
        currency: 'INR',
        paymentMethod: PaymentMethodEnum.UPI,
        status: PaymentStatusEnum.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
        order: mockOrder,
      });

      const res = await service.getPaymentById(mockUserId, mockPaymentId);
      expect(res.success).toBe(true);
      expect(res.payment.id).toBe(mockPaymentId);
    });
  });

  describe('confirmCod', () => {
    it('should confirm COD payment successfully', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        paymentMethod: PaymentMethodEnum.COD,
      });
      prisma.payment.create.mockResolvedValue({
        id: mockPaymentId,
        status: PaymentStatusEnum.COMPLETED,
      });

      const res = await service.confirmCod(mockUserId, mockIdempotencyKey, {
        orderId: mockOrderId,
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('COD payment confirmed');
    });

    it('should throw ConflictException if COD not selected', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        paymentMethod: PaymentMethodEnum.UPI,
      });

      await expect(
        service.confirmCod(mockUserId, mockIdempotencyKey, {
          orderId: mockOrderId,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('handleWebhook', () => {
    it('should throw BadRequestException if webhook signature is invalid', async () => {
      razorpayService.verifyWebhookSignature.mockReturnValue(false);
      await expect(
        service.handleWebhook('invalid_sig', { event: 'payment.captured' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log unknown webhook event and return HTTP 200 success', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });

      const res = await service.handleWebhook('mock_wh_sig_123', {
        event_id: 'evt_unknown_123',
        event: 'unsupported.event.type',
      });

      expect(prisma.webhookLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt_unknown_123',
          event: 'unsupported.event.type',
          status: 'SUCCESS',
        }),
      });
      expect(res.success).toBe(true);
      expect(res.message).toBe('Webhook processed successfully');
    });

    it('should handle duplicate webhook idempotently', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue({ id: 'w1', eventId: 'evt_dup_123' });

      const res = await service.handleWebhook('mock_wh_sig_123', {
        event_id: 'evt_dup_123',
        event: 'payment.captured',
      });

      expect(res.success).toBe(true);
      expect(res.message).toBe('Webhook event already processed');
    });

    it('should process payment.captured event and mark payment & order COMPLETED and fulfill stock reservations', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        userId: mockUserId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_123',
      });
      prisma.payment.update.mockResolvedValue({
        id: mockPaymentId,
        status: PaymentStatusEnum.COMPLETED,
      });
      prisma.order.update.mockResolvedValue({
        id: mockOrderId,
        paymentStatus: PaymentStatusEnum.COMPLETED,
        orderStatus: 'PLACED',
      });

      const res = await service.handleWebhook('mock_wh_sig_123', {
        id: 'evt_captured_123',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_123',
              order_id: 'order_rzp_123',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            status: PaymentStatusEnum.COMPLETED,
            razorpayPaymentId: 'pay_rzp_123',
          }),
        }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId },
          data: expect.objectContaining({
            paymentStatus: PaymentStatusEnum.COMPLETED,
            orderStatus: 'PLACED',
          }),
        }),
      );
      expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, isFulfilled: false },
          data: { isFulfilled: true },
        }),
      );
      expect(res.success).toBe(true);
    });

    it('should process payment.failed event and mark payment & order FAILED and release stock reservations', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        userId: mockUserId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_123',
      });
      prisma.payment.update.mockResolvedValue({
        id: mockPaymentId,
        status: PaymentStatusEnum.FAILED,
      });

      const res = await service.handleWebhook('mock_wh_sig_123', {
        id: 'evt_failed_123',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_123',
              order_id: 'order_rzp_123',
              error_description: 'Card declined by bank',
            },
          },
        },
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            status: PaymentStatusEnum.FAILED,
            failureReason: 'Card declined by bank',
          }),
        }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId },
          data: { paymentStatus: PaymentStatusEnum.FAILED },
        }),
      );
      expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, isFulfilled: false },
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        }),
      );
      expect(res.success).toBe(true);
    });

    it('should process refund.processed event and mark order as RETURNED', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        userId: mockUserId,
        status: PaymentStatusEnum.COMPLETED,
        razorpayPaymentId: 'pay_rzp_123',
      });
      prisma.order.update.mockResolvedValue({
        id: mockOrderId,
        orderStatus: 'RETURNED',
      });

      const res = await service.handleWebhook('mock_wh_sig_123', {
        id: 'evt_refund_123',
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_123',
              payment_id: 'pay_rzp_123',
              amount: 150000,
            },
          },
        },
      });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId },
          data: { orderStatus: 'RETURNED' },
        }),
      );
      expect(res.success).toBe(true);
    });
  });
});
