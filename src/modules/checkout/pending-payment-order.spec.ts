import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '@prisma/client';

import { CheckoutService } from './checkout.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { PendingOrderCleanupService } from '../orders/pending-order-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayService } from '../payments/razorpay.service';
import { ShippingService } from '../admin/shipping/shipping.service';
import { SettingsService } from '../admin/settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockAlertService } from '../notifications/stock-alert.service';
import { InvoicePdfService } from '../orders/invoice-pdf.service';
import { CheckoutPaymentMethodEnum } from './dto/place-order.dto';

/**
 * Issue 2 — an abandoned or cancelled UPI payment must not leave behind a
 * visible order, decremented stock, or a Shiprocket shipment.
 */
describe('Abandoned online payment (Issue 2)', () => {
  let checkoutService: CheckoutService;
  let paymentsService: PaymentsService;
  let ordersService: OrdersService;
  let cleanupService: PendingOrderCleanupService;
  let prisma: any;
  let shippingService: any;

  const userId = '11111111-1111-4111-8111-111111111111';
  const orderId = '33333333-3333-4333-8333-333333333333';
  const paymentId = '44444444-4444-4444-8444-444444444444';
  const addressId = '55555555-5555-4555-8555-555555555555';
  const productId = '66666666-6666-4666-8666-666666666666';
  const idempotencyKey = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  const cartItem = {
    id: 'ci-1',
    userId,
    productId,
    variantId: null,
    quantity: 2,
    product: {
      id: productId,
      name: 'Runner X',
      price: 2000,
      discountPrice: null,
      status: 'ACTIVE',
      deletedAt: null,
      stock: 10,
    },
    variant: null,
  };

  const pendingOrder = {
    id: orderId,
    orderNumber: 'ORD-PENDING-1',
    userId,
    addressId,
    grandTotal: 4000,
    paymentMethod: PaymentMethodEnum.UPI,
    paymentStatus: PaymentStatusEnum.PENDING,
    orderStatus: OrderStatusEnum.PENDING,
    shiprocketShipmentId: null,
    trackingNumber: null,
    createdAt: new Date(),
    items: [
      {
        productId,
        variantId: null,
        quantity: 2,
        productName: 'Runner X',
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(pendingOrder),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          ...pendingOrder,
          items: undefined,
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: paymentId,
          orderId,
          userId,
          amount: 4000,
          currency: 'INR',
          status: PaymentStatusEnum.PENDING,
          paymentMethod: PaymentMethodEnum.UPI,
          razorpayOrderId: 'order_rzp_1',
        }),
        update: jest.fn().mockResolvedValue({
          id: paymentId,
          status: PaymentStatusEnum.COMPLETED,
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      cartItem: {
        findMany: jest.fn().mockResolvedValue([cartItem]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({ id: addressId, userId }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockReservation: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'res-1', userId, isFulfilled: false }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ stock: 10, name: 'Runner X' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({ stock: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderReturn: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      webhookLog: { findUnique: jest.fn(), create: jest.fn() },
      refundAudit: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    shippingService = {
      createShipmentForOrder: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        PaymentsService,
        OrdersService,
        PendingOrderCleanupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ShippingService, useValue: shippingService },
        {
          provide: RazorpayService,
          useValue: {
            getKeyId: jest.fn().mockReturnValue('rzp_test_key'),
            createRazorpayOrder: jest
              .fn()
              .mockResolvedValue({ id: 'order_rzp_1', amount: 400000 }),
            verifySignature: jest.fn().mockReturnValue(true),
            verifyWebhookSignature: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getDeliverySettingsRaw: jest
              .fn()
              .mockResolvedValue({ deliveryFeeEnabled: false }),
            getTaxSettingsRaw: jest.fn().mockResolvedValue({ gstEnabled: false }),
            getPaymentSettingsRaw: jest.fn().mockResolvedValue({
              cod: { enabled: true, extraFee: 0 },
              upi: { enabled: true },
              card: { enabled: true },
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyOrderPlaced: jest.fn(),
            notifyPaymentSuccess: jest.fn(),
            notifyPaymentFailed: jest.fn(),
            notifyOrderStatusChange: jest.fn(),
            notifyReturnStatus: jest.fn(),
            notifyRefundStatus: jest.fn(),
            sendEventNotification: jest.fn(),
          },
        },
        {
          provide: StockAlertService,
          useValue: { evaluateStockChange: jest.fn() },
        },
        {
          provide: InvoicePdfService,
          useValue: { generateInvoicePdf: jest.fn() },
        },
      ],
    }).compile();

    checkoutService = module.get(CheckoutService);
    paymentsService = module.get(PaymentsService);
    ordersService = module.get(OrdersService);
    cleanupService = module.get(PendingOrderCleanupService);
  });

  describe('placement', () => {
    it('creates an online order hidden, with no stock taken, no cart clear and no shipment', async () => {
      const res = await checkoutService.placeOrder(userId, idempotencyKey, {
        addressId,
        paymentMethod: CheckoutPaymentMethodEnum.UPI,
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: 'PENDING',
            paymentStatus: 'PENDING',
          }),
        }),
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(shippingService.createShipmentForOrder).not.toHaveBeenCalled();

      // The gateway order the client needs to open Razorpay.
      expect(res).toEqual(
        expect.objectContaining({
          requiresPayment: true,
          payment: expect.objectContaining({
            razorpayOrderId: 'order_rzp_1',
            key: 'rzp_test_key',
          }),
        }),
      );
    });

    it('keeps the COD flow unchanged: PLACED, stock taken, cart cleared, shipment created', async () => {
      prisma.order.create.mockResolvedValue({
        ...pendingOrder,
        orderStatus: OrderStatusEnum.PLACED,
        paymentMethod: PaymentMethodEnum.COD,
        items: undefined,
      });

      const res = await checkoutService.placeOrder(userId, idempotencyKey, {
        addressId,
        paymentMethod: CheckoutPaymentMethodEnum.COD,
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderStatus: 'PLACED' }),
        }),
      );
      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId, stock: { gte: 2 } },
          data: { stock: { decrement: 2 } },
        }),
      );
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(shippingService.createShipmentForOrder).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(OrderStatusEnum.PLACED);
    });
  });

  describe('payment confirmation', () => {
    beforeEach(() => {
      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.order.findUnique.mockResolvedValue(pendingOrder);
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        orderId,
        userId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_1',
      });
    });

    it('promotes the order, takes stock and creates the shipment only after verification', async () => {
      await paymentsService.verifyPayment(userId, {
        orderId,
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_1',
        signature: 'sig',
      });

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: orderId,
            orderStatus: OrderStatusEnum.PENDING,
          }),
          data: {
            orderStatus: OrderStatusEnum.PLACED,
            paymentStatus: PaymentStatusEnum.COMPLETED,
          },
        }),
      );
      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId, stock: { gte: 2 } },
          data: { stock: { decrement: 2 } },
        }),
      );
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(shippingService.createShipmentForOrder).toHaveBeenCalledTimes(1);
    });

    it('does not create a second shipment when the webhook lands after the callback', async () => {
      await paymentsService.verifyPayment(userId, {
        orderId,
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_1',
        signature: 'sig',
      });

      // The order now carries a shipment and is no longer claimable.
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        orderStatus: OrderStatusEnum.PLACED,
        paymentStatus: PaymentStatusEnum.COMPLETED,
        shiprocketShipmentId: 'ship_1',
        trackingNumber: 'AWB123',
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w1' });
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        orderId,
        userId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_1',
      });

      await paymentsService.handleWebhook(
        'sig',
        {
          id: 'evt_1',
          event: 'payment.captured',
          payload: {
            payment: { entity: { id: 'pay_1', order_id: 'order_rzp_1' } },
          },
        },
        Buffer.from('{}'),
      );

      expect(shippingService.createShipmentForOrder).toHaveBeenCalledTimes(1);
    });

    it('leaves a failed payment hidden with no stock taken and no shipment', async () => {
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.webhookLog.create.mockResolvedValue({ id: 'w2' });
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        orderId,
        userId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_1',
      });

      await paymentsService.handleWebhook(
        'sig',
        {
          id: 'evt_2',
          event: 'payment.failed',
          payload: {
            payment: {
              entity: {
                id: 'pay_1',
                order_id: 'order_rzp_1',
                error_description: 'Cancelled by user',
              },
            },
          },
        },
        Buffer.from('{}'),
      );

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { paymentStatus: PaymentStatusEnum.FAILED },
        }),
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(shippingService.createShipmentForOrder).not.toHaveBeenCalled();
    });

    it('never resurrects an order already cancelled by the cleanup cron', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
      });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await paymentsService.verifyPayment(userId, {
        orderId,
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_1',
        signature: 'sig',
      });

      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(shippingService.createShipmentForOrder).not.toHaveBeenCalled();
    });
  });

  describe('late capture after cleanup (limitation a)', () => {
    beforeEach(() => {
      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        orderId,
        userId,
        status: PaymentStatusEnum.PENDING,
        razorpayOrderId: 'order_rzp_1',
      });
    });

    it('refunds a capture that lands on an already-cancelled order, exactly once', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
      });
      // promotion claims (PENDING / visible) miss; the late-capture claim wins
      prisma.order.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      const refundSpy = jest
        .spyOn(paymentsService, 'initiateRefundForOrder')
        .mockResolvedValue({
          success: true,
          refundInitiated: true,
          message: 'Refund initiated successfully',
        });

      await paymentsService.verifyPayment(userId, {
        orderId,
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_1',
        signature: 'sig',
      });

      expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
        where: expect.objectContaining({
          id: orderId,
          orderStatus: OrderStatusEnum.CANCELLED,
        }),
        data: { paymentStatus: PaymentStatusEnum.COMPLETED },
      });
      expect(refundSpy).toHaveBeenCalledTimes(1);
      expect(refundSpy).toHaveBeenCalledWith(
        expect.objectContaining({ orderId, actorType: 'SYSTEM' }),
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(shippingService.createShipmentForOrder).not.toHaveBeenCalled();
    });

    it('does not refund when another confirmation already claimed it', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
      });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      const refundSpy = jest.spyOn(paymentsService, 'initiateRefundForOrder');

      await paymentsService.verifyPayment(userId, {
        orderId,
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_1',
        signature: 'sig',
      });

      expect(refundSpy).not.toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it('never lists a PENDING order, even when asked for status=PENDING', async () => {
      await ordersService.getOrders(userId, { status: 'PENDING' } as any);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: { orderStatus: OrderStatusEnum.PENDING },
          }),
        }),
      );
    });

    it('omits PENDING from the ONGOING bucket', async () => {
      await ordersService.getOrders(userId, { type: 'ongoing' } as any);

      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.orderStatus.in).not.toContain(OrderStatusEnum.PENDING);
      expect(where.NOT).toEqual({ orderStatus: OrderStatusEnum.PENDING });
    });

    it('404s the order detail of a PENDING order with no payment attempt', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        items: [],
        payments: [],
        returns: [],
      });
      prisma.payment.count.mockResolvedValue(0);

      await expect(ordersService.getOrderById(userId, orderId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s the order detail of a PENDING order past the retry window', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        items: [],
        payments: [],
        returns: [],
      });
      prisma.payment.count.mockResolvedValue(1);

      await expect(ordersService.getOrderById(userId, orderId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('exposes a PENDING order to the retry screen while the attempt is live', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        items: [],
        payments: [],
        returns: [],
      });
      prisma.payment.count.mockResolvedValue(1);

      const res = await ordersService.getOrderById(userId, orderId);
      expect(res.awaitingPayment).toBe(true);
    });
  });

  describe('cleanup cron', () => {
    it('cancels abandoned unpaid orders older than the retry window', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: orderId,
          orderNumber: 'ORD-PENDING-1',
          shiprocketShipmentId: null,
          trackingNumber: null,
        },
      ]);

      const res = await cleanupService.cancelAbandonedPendingOrders();

      expect(res.cancelledCount).toBe(1);
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: orderId,
            orderStatus: OrderStatusEnum.PENDING,
          }),
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment timeout',
          }),
        }),
      );
      // Stock was never taken for a PENDING order, so nothing is restored.
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it('does not cancel an order that was paid in the meantime', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: orderId,
          orderNumber: 'ORD-PENDING-1',
          shiprocketShipmentId: null,
          trackingNumber: null,
        },
      ]);
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      const res = await cleanupService.cancelAbandonedPendingOrders();
      expect(res.cancelledCount).toBe(0);
    });
  });
});
