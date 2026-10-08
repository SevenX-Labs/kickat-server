import { NotificationsService } from "../notifications/notifications.service";
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
        // promoteOrderAfterPayment() re-reads the order (with items) before
        // claiming the hidden -> PLACED promotion.
        findUnique: jest.fn().mockResolvedValue({ ...mockOrder, items: [] }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockReservation: {
        updateMany: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refundAudit: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
      createRefund: jest.fn().mockResolvedValue({ id: 'rfnd_mock_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
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
      // The promotion is an atomic conditional claim so the success callback
      // and the webhook can never both apply it.
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: mockOrderId,
            orderStatus: 'PENDING',
            paymentStatus: { not: PaymentStatusEnum.COMPLETED },
          }),
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
      // Guarded so a failure event can never downgrade an already-paid order,
      // and so a hidden (PENDING) order keeps its hidden orderStatus.
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: mockOrderId,
            paymentStatus: { not: PaymentStatusEnum.COMPLETED },
          },
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
          data: expect.objectContaining({ orderStatus: 'RETURNED' }),
        }),
      );
      expect(res.success).toBe(true);
    });
  });

  describe('initiateRefundForOrder', () => {
    const paidOrder = {
      ...mockOrder,
      paymentStatus: PaymentStatusEnum.COMPLETED,
    };

    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      prisma.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        orderId: mockOrderId,
        status: PaymentStatusEnum.COMPLETED,
        razorpayPaymentId: 'pay_captured_1',
      });
    });

    it('moves the order to REFUND_INITIATED and records the admin actor', async () => {
      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        reason: 'Out of stock',
        actorType: 'ADMIN',
        adminId: 'admin-7',
      });

      expect(res.refundInitiated).toBe(true);
      expect(razorpayService.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay_captured_1',
          amountInPaise: 150000,
        }),
      );
      // This transition is what stops a second refund being stacked later.
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: { paymentStatus: PaymentStatusEnum.REFUND_INITIATED },
      });
      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REFUND_INITIATED',
            actorType: 'ADMIN',
            initiatedByAdminId: 'admin-7',
            providerRefundId: 'rfnd_mock_1',
          }),
        }),
      );
    });

    it('defaults to no admin attribution when no adminId is supplied', async () => {
      await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'CUSTOMER',
      });

      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorType: 'CUSTOMER',
            initiatedByAdminId: null,
          }),
        }),
      );
    });

    it('refuses a second refund once the order left COMPLETED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        paymentStatus: PaymentStatusEnum.REFUND_INITIATED,
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(res.refundInitiated).toBe(false);
      expect(res.message).toContain('No refund required');
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('never throws when the gateway refund fails, and reports the failure', async () => {
      razorpayService.createRefund.mockRejectedValue(
        new Error('card network declined'),
      );

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
        adminId: 'admin-7',
      });

      expect(res.success).toBe(false);
      expect(res.refundInitiated).toBe(false);
      expect(res.message).toContain('card network declined');
      // Cancellation must not be left looking refunded.
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            initiatedByAdminId: 'admin-7',
          }),
        }),
      );
    });

    it('HARD GATE: gateway success + simulated DB write error reports success, not failure', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'CUSTOMER',
      });

      expect(res.success).toBe(true);
      expect(res.refundInitiated).toBe(true);
      expect(res.providerRefundId).toBe('rfnd_mock_1');
      expect(res.message).toContain('pending reconciliation');
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
    });

    it('Test C: existing FAILED audit allows legitimate retry without unique constraint collision', async () => {
      // First attempt failed
      prisma.refundAudit.findFirst.mockResolvedValueOnce(null); // No live refund
      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
        adminId: 'admin-7',
      });

      expect(res.success).toBe(true);
      expect(res.refundInitiated).toBe(true);
      expect(res.providerRefundId).toBe('rfnd_mock_1');
      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REFUND_INITIATED',
            providerRefundId: 'rfnd_mock_1',
            idempotencyKey: `cancel_refund_${mockOrderId}_rfnd_mock_1`,
          }),
        }),
      );
    });

    it('Test D: existing live REFUND_INITIATED or REFUNDED audit blocks second gateway call', async () => {
      prisma.refundAudit.findFirst.mockResolvedValueOnce({
        id: 'audit-active-1',
        status: 'REFUND_INITIATED',
        amount: 1500,
        providerRefundId: 'rfnd_existing_1',
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(res.refundInitiated).toBe(false);
      expect(res.message).toContain('A refund is already recorded');
      expect(res.providerRefundId).toBe('rfnd_existing_1');
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    /**
     * Stateful RefundAudit store so a second attempt sees what the first one
     * wrote. `findFirst` emulates the live-refund guard's real predicate
     * (status NOT IN (FAILED) AND (status IN (live...) OR providerRefundId
     * IS NOT NULL)) and `create` enforces the unique idempotencyKey.
     */
    const useStatefulAudits = () => {
      const rows: any[] = [];

      prisma.refundAudit.create.mockImplementation(async ({ data }: any) => {
        if (
          data.idempotencyKey &&
          rows.some((r) => r.idempotencyKey === data.idempotencyKey)
        ) {
          const err: any = new Error(
            'Unique constraint failed on the fields: (`idempotencyKey`)',
          );
          err.code = 'P2002';
          throw err;
        }
        const row = { id: `aud-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      });

      prisma.refundAudit.findFirst.mockImplementation(async ({ where }: any) => {
        const matches = rows.filter((r) => {
          if (where.orderId && r.orderId !== where.orderId) return false;
          if (where.status?.notIn?.includes(r.status)) return false;
          if (!where.OR) return true;
          return where.OR.some(
            (c: any) =>
              (c.status?.in && c.status.in.includes(r.status)) ||
              (c.providerRefundId?.not === null && r.providerRefundId != null),
          );
        });
        return matches.length > 0 ? matches[matches.length - 1] : null;
      });

      return rows;
    };

    it('Test A: a second attempt makes no gateway call', async () => {
      const rows = useStatefulAudits();

      const first = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });
      expect(first.refundInitiated).toBe(true);
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);

      const second = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(second.refundInitiated).toBe(false);
      expect(second.message).toContain('already recorded');
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
    });

    it('Test A2: an order already past COMPLETED is refused before any lookup', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...paidOrder,
        paymentStatus: PaymentStatusEnum.REFUND_INITIATED,
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(res.refundInitiated).toBe(false);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('Test B / Gap 3: local persistence failure still blocks a duplicate gateway refund', async () => {
      const rows = useStatefulAudits();
      // The whole persistence transaction fails after the gateway succeeded.
      prisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

      const first = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'CUSTOMER',
      });

      // Hard gate: still reported as a success, never as FAILED.
      expect(first.success).toBe(true);
      expect(first.refundInitiated).toBe(true);
      expect(first.providerRefundId).toBe('rfnd_mock_1');
      expect(first.message).toContain('pending reconciliation');

      // The out-of-band recovery row was written outside the transaction, and
      // carries the provider refund id the guard keys off.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'REFUND_INITIATED',
        providerRefundId: 'rfnd_mock_1',
        idempotencyKey: `cancel_refund_${mockOrderId}_rfnd_mock_1`,
      });
      expect(rows[0].failureReason).toContain('local persistence failed');

      // A retry must NOT refund again, even though paymentStatus never moved.
      const retry = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(retry.refundInitiated).toBe(false);
      expect(retry.providerRefundId).toBe('rfnd_mock_1');
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
    });

    it('Test B2: the recovery row is the one the refund.processed webhook promotes', async () => {
      const rows = useStatefulAudits();
      prisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

      await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'CUSTOMER',
      });

      // The webhook looks for the newest REFUND_INITIATED audit on the order;
      // the recovery row must satisfy that, so it is promoted rather than
      // duplicated.
      expect(rows[0].status).toBe('REFUND_INITIATED');
      expect(rows[0].orderId).toBe(mockOrderId);
    });

    it('Test E: concurrent attempts produce exactly one real gateway refund', async () => {
      useStatefulAudits();

      const results = await Promise.all([
        service.initiateRefundForOrder({ orderId: mockOrderId, actorType: 'ADMIN' }),
        service.initiateRefundForOrder({ orderId: mockOrderId, actorType: 'CUSTOMER' }),
      ]);

      // The money moves exactly once...
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
      // ...and the second caller coalesces onto that same attempt rather than
      // being told the refund failed (which would invite a manual refund).
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.every((r) => r.providerRefundId === 'rfnd_mock_1')).toBe(true);
      expect(prisma.refundAudit.create).toHaveBeenCalledTimes(1);
    });

    it('Test E2: a concurrent loser still reports the real provider refund id', async () => {
      useStatefulAudits();

      const results = await Promise.all([
        service.initiateRefundForOrder({ orderId: mockOrderId, actorType: 'ADMIN' }),
        service.initiateRefundForOrder({ orderId: mockOrderId, actorType: 'ADMIN' }),
      ]);

      for (const res of results) {
        expect(res.providerRefundId).toBe('rfnd_mock_1');
      }
    });

    it('Test F: a manual admin refund already recorded blocks the cancel-time refund', async () => {
      // POST /admin/orders/:id/refund records a REFUND_INITIATED audit without
      // moving paymentStatus off COMPLETED.
      prisma.refundAudit.findFirst.mockResolvedValue({
        id: 'aud-manual-1',
        status: 'REFUND_INITIATED',
        amount: 1500,
        providerRefundId: null,
        idempotencyKey: `admin_refund_${mockOrderId}_1700000000000`,
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
        adminId: 'admin-7',
      });

      expect(res.refundInitiated).toBe(false);
      expect(res.message).toContain('already recorded');
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('Test G: repeating an admin cancel refund does not refund twice', async () => {
      useStatefulAudits();

      for (let attempt = 0; attempt < 3; attempt++) {
        await service.initiateRefundForOrder({
          orderId: mockOrderId,
          actorType: 'ADMIN',
          adminId: 'admin-7',
        });
      }

      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
    });

    it('Gap 1: a FAILED audit carrying a providerRefundId still allows a retry', async () => {
      // This is the state refund.failed leaves behind: it stamps the provider
      // refund id on a FAILED row and reverts paymentStatus to COMPLETED so
      // the refund can be retried.
      prisma.refundAudit.findFirst.mockImplementation(async ({ where }: any) => {
        const row = {
          id: 'aud-failed-1',
          status: 'FAILED',
          providerRefundId: 'rfnd_failed_1',
          amount: 1500,
        };
        if (where.status?.notIn?.includes(row.status)) return null;
        return row;
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(res.refundInitiated).toBe(true);
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
    });

    it('handles COD cancellation refund without gateway call and with distinct key', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...paidOrder,
        paymentMethod: PaymentMethodEnum.COD,
      });

      const res = await service.initiateRefundForOrder({
        orderId: mockOrderId,
        actorType: 'ADMIN',
      });

      expect(res.refundInitiated).toBe(true);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refundMethod: 'COD',
            status: 'REFUND_INITIATED',
          }),
        }),
      );
    });
  });
});
