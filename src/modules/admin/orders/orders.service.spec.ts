import { NotificationsService } from "../../notifications/notifications.service";
import { InvoicePdfService } from "../../orders/invoice-pdf.service";
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { AdminOrderSortEnum, AdminOrdersQueryDto } from './dto/admin-order.dto';
import { ShippingService } from '../shipping/shipping.service';
import { PaymentsService } from '../../payments/payments.service';

describe('Admin OrdersService', () => {
  let service: OrdersService;
  let prisma: any;
  const mockShippingService = { cancelShipmentForOrder: jest.fn() };
  const mockPaymentsService = { initiateRefundForOrder: jest.fn() };

    const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    productVariant: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    refundAudit: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    orderReturn: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
        { provide: InvoicePdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from("pdf-data")) } },
        OrdersService,
        { provide: ShippingService, useValue: mockShippingService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: SettingsService, useValue: { getTaxSettingsRaw: jest.fn().mockResolvedValue({ gstEnabled: false }) } },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrders', () => {
    it('should return paginated orders with filters, search, and summary counters', async () => {
      const date = new Date('2026-08-11T09:00:00.000Z');
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          userId: 'user-1',
          orderStatus: OrderStatusEnum.PROCESSING,
          paymentStatus: PaymentStatusEnum.COMPLETED,
          paymentMethod: PaymentMethodEnum.UPI,
          subtotal: 1000,
        gstPercentage: 18,
        gstAmount: 180,
        gstPercentage: 18,
        gstAmount: 180,
          deliveryFee: 50,
          grandTotal: 1050,
          createdAt: date,
          updatedAt: date,
          user: { id: 'user-1', name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
          address: { id: 'addr-1', city: 'Mumbai' },
          items: [
            {
              id: 'item-1',
              productName: 'Cat Food',
              variantName: '1kg',
              quantity: 2,
              price: 500,
              totalPrice: 1000,
            },
          ],
          payments: [{ id: 'p-1', status: PaymentStatusEnum.COMPLETED }],
          returns: [],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(0) // pending
        .mockResolvedValueOnce(1) // processing
        .mockResolvedValueOnce(0) // packed
        .mockResolvedValueOnce(0) // shipped
        .mockResolvedValueOnce(0) // delivered
        .mockResolvedValueOnce(0) // cancelled
        .mockResolvedValueOnce(0); // returned

      prisma.order.aggregate.mockResolvedValue({
        _sum: { grandTotal: 1050 },
      });

      const query: AdminOrdersQueryDto = {
        page: 1,
        limit: 10,
        status: OrderStatusEnum.PROCESSING,
        search: 'John',
        sort: AdminOrderSortEnum.TOTAL_DESC,
      };

      const result = await service.getOrders(query);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].orderNumber).toBe('ORD-1001');
      expect(result.data.orders[0].itemsSummary).toBe('Cat Food (1kg) x2');
      expect(result.data.summary.totalRevenue).toBe(1050);
      expect(result.data.summary.processingCount).toBe(1);
    });
  });

  describe('getOrderById', () => {
    it('should return complete order details by UUID or orderNumber', async () => {
      const mockOrder = {
        id: '11111111-1111-4111-a111-111111111111',
        orderNumber: 'ORD-9999',
        orderStatus: OrderStatusEnum.SHIPPED,
        items: [{ id: 'item-1', quantity: 3 }],
        payments: [],
        returns: [],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getOrderById('ORD-9999');

      expect(result.success).toBe(true);
      expect(result.data.orderNumber).toBe('ORD-9999');
      expect(result.data.itemsCount).toBe(3);
    });

    it('should throw NotFoundException if order not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrderById('ORD-NON-EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('should update status and tracking metadata', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.PACKED,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.order.update.mockResolvedValue({
        ...existingOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
        trackingNumber: 'TRK-12345',
        courierPartner: 'BlueDart',
      });

      const result = await service.updateOrderStatus('ord-1', {
        status: OrderStatusEnum.SHIPPED,
        trackingNumber: 'TRK-12345',
        courierPartner: 'BlueDart',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order status updated to SHIPPED');
      expect(result.data.trackingNumber).toBe('TRK-12345');
    });

    it('should automatically mark COD order payment as COMPLETED when delivered', async () => {
      const codOrder = {
        id: 'ord-cod-100',
        orderNumber: 'ORD-COD-100',
        orderStatus: OrderStatusEnum.SHIPPED,
        paymentMethod: PaymentMethodEnum.COD,
        paymentStatus: PaymentStatusEnum.PENDING,
      };

      prisma.order.findFirst.mockResolvedValue(codOrder);
      prisma.order.update.mockResolvedValue({
        ...codOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateOrderStatus('ord-cod-100', {
        status: OrderStatusEnum.DELIVERED,
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.DELIVERED,
            paymentStatus: PaymentStatusEnum.COMPLETED,
          }),
        }),
      );
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'ord-cod-100', status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.COMPLETED },
      });
    });

    it('should update paymentStatus explicitly when provided in dto', async () => {
      const order = {
        id: 'ord-explicit-1',
        orderNumber: 'ORD-EXP-1',
        orderStatus: OrderStatusEnum.PROCESSING,
        paymentMethod: PaymentMethodEnum.CARD,
        paymentStatus: PaymentStatusEnum.PENDING,
      };

      prisma.order.findFirst.mockResolvedValue(order);
      prisma.order.update.mockResolvedValue({
        ...order,
        orderStatus: OrderStatusEnum.SHIPPED,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateOrderStatus('ord-explicit-1', {
        status: OrderStatusEnum.SHIPPED,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.SHIPPED,
            paymentStatus: PaymentStatusEnum.COMPLETED,
          }),
        }),
      );
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'ord-explicit-1', status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.COMPLETED },
      });
    });
  });

  describe('cancelOrder', () => {
    const baseOrder = {
      id: 'ord-1',
      orderNumber: 'ORD-1001',
      userId: 'user-1',
      orderStatus: OrderStatusEnum.PLACED,
      shiprocketOrderId: null as string | null,
      shiprocketShipmentId: null as string | null,
      trackingNumber: null as string | null,
      items: [
        { productId: 'prod-1', variantId: 'var-1', quantity: 2 },
        { productId: 'prod-2', variantId: null, quantity: 1 },
      ],
    };

    const paidOrder = {
      ...baseOrder,
      paymentMethod: PaymentMethodEnum.UPI,
      paymentStatus: PaymentStatusEnum.COMPLETED,
      grandTotal: 1049,
    };

    const arrangeCancel = (order: any) => {
      prisma.order.findFirst.mockResolvedValue(order);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUnique.mockResolvedValue({
        ...order,
        orderStatus: OrderStatusEnum.CANCELLED,
        cancelReason: 'Customer requested',
      });
      prisma.refundAudit.findFirst.mockResolvedValue(null);
      mockPaymentsService.initiateRefundForOrder.mockResolvedValue({
        success: true,
        refundInitiated: true,
        message: 'Refund initiated successfully',
        providerRefundId: 'rfnd_1',
        amount: order.grandTotal ?? 0,
      });
    };

    it('should cancel order and automatically restock items', async () => {
      arrangeCancel(baseOrder);

      const result = await service.cancelOrder('ord-1', {
        reason: 'Customer requested',
        restockItems: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Order cancelled successfully');
      expect(prisma.product.update).toHaveBeenCalledTimes(2);
      expect(prisma.productVariant.update).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException if order is already cancelled', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'ord-1',
        orderStatus: OrderStatusEnum.CANCELLED,
        shiprocketShipmentId: 'ship-1',
      });

      await expect(
        service.cancelOrder('ord-1', { reason: 'Duplicate' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockShippingService.cancelShipmentForOrder).not.toHaveBeenCalled();
    });

    it('does not call the provider when the order has no shipment', async () => {
      arrangeCancel(baseOrder);

      const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

      expect(result.success).toBe(true);
      expect(result.shipmentCancellation.attempted).toBe(false);
      expect(mockShippingService.cancelShipmentForOrder).not.toHaveBeenCalled();
      expect(prisma.product.update).toHaveBeenCalledTimes(2);
    });

    it('cancels the provider shipment once, after the DB transaction commits', async () => {
      const callOrder: string[] = [];
      prisma.$transaction.mockImplementationOnce(async (cb: any) => {
        const res = await cb(prisma);
        callOrder.push('commit');
        return res;
      });
      mockShippingService.cancelShipmentForOrder.mockImplementation(async () => {
        callOrder.push('provider');
        return { success: true, message: 'Shiprocket order 555 cancelled' };
      });
      arrangeCancel({
        ...baseOrder,
        orderStatus: OrderStatusEnum.PACKED,
        shiprocketOrderId: '555',
        shiprocketShipmentId: 'ship-1',
        trackingNumber: 'AWB1',
      });

      const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

      expect(mockShippingService.cancelShipmentForOrder).toHaveBeenCalledTimes(1);
      expect(mockShippingService.cancelShipmentForOrder).toHaveBeenCalledWith('ord-1');
      expect(callOrder).toEqual(['commit', 'provider']);
      expect(result.shipmentCancellation).toEqual({
        attempted: true,
        success: true,
        message: 'Shiprocket order 555 cancelled',
      });
      expect(result.message).toContain('Order cancelled successfully');
      expect(prisma.product.update).toHaveBeenCalledTimes(2);
    });

    it('does not report success for the shipment when the provider cancel throws', async () => {
      mockShippingService.cancelShipmentForOrder.mockRejectedValue(
        new Error('Shiprocket 400: cannot cancel'),
      );
      arrangeCancel({ ...baseOrder, shiprocketShipmentId: 'ship-1' });

      const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

      expect(result.data.orderStatus).toBe(OrderStatusEnum.CANCELLED);
      expect(result.shipmentCancellation.success).toBe(false);
      expect(result.shipmentCancellation.message).toContain('cannot cancel');
      expect(result.message).toContain('could not be cancelled automatically');
    });

    it('surfaces a non-success provider result without throwing', async () => {
      mockShippingService.cancelShipmentForOrder.mockResolvedValue({
        success: false,
        message: 'Provider NULL does not support shipment cancellation',
      });
      arrangeCancel({ ...baseOrder, shiprocketOrderId: '555' });

      const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

      expect(result.shipmentCancellation.success).toBe(false);
      expect(result.message).toContain('could not be cancelled automatically');
    });

    it('skips the provider for a shipment already closed (delivered)', async () => {
      arrangeCancel({
        ...baseOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
        shiprocketShipmentId: 'ship-1',
      });

      const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

      expect(result.shipmentCancellation.attempted).toBe(false);
      expect(mockShippingService.cancelShipmentForOrder).not.toHaveBeenCalled();
    });

    it('loses the atomic claim on a concurrent cancel: no restock, no provider call', async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...baseOrder,
        shiprocketShipmentId: 'ship-1',
      });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelOrder('ord-1', { reason: 'Ops' }),
      ).rejects.toThrow('Order is already cancelled');
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(mockShippingService.cancelShipmentForOrder).not.toHaveBeenCalled();
      expect(mockPaymentsService.initiateRefundForOrder).not.toHaveBeenCalled();
    });

    describe('automatic refund', () => {
      it('refunds a captured payment once, as ADMIN, after the DB commit', async () => {
        const callOrder: string[] = [];
        prisma.$transaction.mockImplementationOnce(async (cb: any) => {
          const res = await cb(prisma);
          callOrder.push('commit');
          return res;
        });
        arrangeCancel({
          ...paidOrder,
          shiprocketOrderId: '555',
          shiprocketShipmentId: 'ship-1',
        });
        mockPaymentsService.initiateRefundForOrder.mockImplementation(async () => {
          callOrder.push('refund');
          return {
            success: true,
            refundInitiated: true,
            message: 'Refund initiated successfully',
            providerRefundId: 'rfnd_1',
            amount: 1049,
          };
        });
        mockShippingService.cancelShipmentForOrder.mockImplementation(async () => {
          callOrder.push('shipment');
          return { success: true, message: 'Shiprocket order 555 cancelled' };
        });

        const result = await service.cancelOrder(
          'ord-1',
          { reason: 'Out of stock', reasonOther: 'warehouse damage' },
          'admin-7',
        );

        expect(mockPaymentsService.initiateRefundForOrder).toHaveBeenCalledTimes(1);
        expect(mockPaymentsService.initiateRefundForOrder).toHaveBeenCalledWith({
          orderId: 'ord-1',
          reason: 'Out of stock — warehouse damage',
          actorType: 'ADMIN',
          adminId: 'admin-7',
        });
        // refund and shipment cancel both happen only after the commit
        expect(callOrder).toEqual(['commit', 'refund', 'shipment']);
        expect(result.refund).toEqual({
          attempted: true,
          success: true,
          status: 'INITIATED',
          amount: 1049,
          reason: 'Refund initiated successfully',
          providerRefundId: 'rfnd_1',
        });
        expect(result.message).toContain('Order cancelled successfully');
        // restock and the shipment sync stay untouched
        expect(prisma.product.update).toHaveBeenCalledTimes(2);
        expect(result.shipmentCancellation.success).toBe(true);
      });

      it('attempts no refund for an unpaid PENDING order', async () => {
        arrangeCancel({
          ...baseOrder,
          paymentMethod: PaymentMethodEnum.UPI,
          paymentStatus: PaymentStatusEnum.PENDING,
        });

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(mockPaymentsService.initiateRefundForOrder).not.toHaveBeenCalled();
        expect(result.refund.attempted).toBe(false);
        expect(result.refund.status).toBe('NOT_REQUIRED');
        expect(result.message).toContain('Order cancelled successfully');
      });

      it('attempts no refund for a COD order with nothing captured', async () => {
        arrangeCancel({
          ...baseOrder,
          paymentMethod: PaymentMethodEnum.COD,
          paymentStatus: PaymentStatusEnum.PENDING,
        });

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(mockPaymentsService.initiateRefundForOrder).not.toHaveBeenCalled();
        expect(result.refund.status).toBe('NOT_REQUIRED');
      });

      it('never reports success when the gateway refund fails, and keeps the cancellation', async () => {
        arrangeCancel(paidOrder);
        mockPaymentsService.initiateRefundForOrder.mockResolvedValue({
          success: false,
          refundInitiated: false,
          message: 'Refund initiation failed: card network declined',
        });

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(result.success).toBe(true);
        expect(result.data.orderStatus).toBe(OrderStatusEnum.CANCELLED);
        expect(prisma.product.update).toHaveBeenCalledTimes(2);
        expect(result.refund.success).toBe(false);
        expect(result.refund.status).toBe('FAILED');
        expect(result.refund.amount).toBe(1049);
        expect(result.message).toContain('refund could not be initiated automatically');
      });

      it('never reports success when the refund call throws', async () => {
        arrangeCancel(paidOrder);
        mockPaymentsService.initiateRefundForOrder.mockRejectedValue(
          new Error('gateway unreachable'),
        );

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(result.data.orderStatus).toBe(OrderStatusEnum.CANCELLED);
        expect(result.refund.success).toBe(false);
        expect(result.refund.status).toBe('FAILED');
        expect(result.refund.reason).toContain('gateway unreachable');
      });

      it('does not stack a second refund when one is already recorded', async () => {
        arrangeCancel(paidOrder);
        prisma.refundAudit.findFirst.mockResolvedValue({
          id: 'aud-1',
          status: 'REFUND_INITIATED',
          amount: 1049,
          providerRefundId: 'rfnd_existing',
        });

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(mockPaymentsService.initiateRefundForOrder).not.toHaveBeenCalled();
        expect(result.refund.attempted).toBe(false);
        expect(result.refund.status).toBe('ALREADY_REFUNDED');
        expect(result.refund.providerRefundId).toBe('rfnd_existing');
        expect(prisma.refundAudit.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              orderId: 'ord-1',
              status: { in: ['REFUND_INITIATED', 'REFUNDED', 'COD_REFUNDED'] },
            },
          }),
        );
      });

      it('reports both failures when the refund and the shipment cancel fail', async () => {
        arrangeCancel({ ...paidOrder, shiprocketShipmentId: 'ship-1' });
        mockPaymentsService.initiateRefundForOrder.mockResolvedValue({
          success: false,
          refundInitiated: false,
          message: 'gateway down',
        });
        mockShippingService.cancelShipmentForOrder.mockRejectedValue(
          new Error('Shiprocket 400'),
        );

        const result = await service.cancelOrder('ord-1', { reason: 'Ops' });

        expect(result.refund.success).toBe(false);
        expect(result.shipmentCancellation.success).toBe(false);
        expect(result.message).toContain('could not be cancelled automatically');
        expect(result.message).toContain('refund could not be initiated automatically');
      });
    });
  });

  describe("confirmCodRefund & confirmReturnReceived", () => {
    it("should reject COD refund before RETURN_RECEIVED", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "ord-cod-1",
        orderNumber: "ORD-COD-1",
        paymentMethod: "COD",
        orderStatus: "SHIPPED",
        grandTotal: 1000,
      });
      prisma.orderReturn.findFirst.mockResolvedValue({
        id: "ret-1",
        status: "INITIATED",
      });

      await expect(
        service.confirmCodRefund("ord-cod-1", {
          transactionReference: "TXN123456",
        }),
      ).rejects.toThrow("COD refund can only be processed after physical return receipt (RETURN_RECEIVED)");
    });

    it("should process COD refund successfully after RETURN_RECEIVED", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "ord-cod-1",
        orderNumber: "ORD-COD-1",
        paymentMethod: "COD",
        orderStatus: "SHIPPED",
        grandTotal: 1000,
        userId: "usr-1",
      });
      prisma.orderReturn.findFirst.mockResolvedValue({
        id: "ret-1",
        status: "RETURN_RECEIVED",
      });
      prisma.$transaction.mockImplementation(async (cb) => {
        prisma.order.updateMany.mockResolvedValue({ count: 1 });
        prisma.orderReturn.updateMany.mockResolvedValue({ count: 1 });
        prisma.payment.create.mockResolvedValue({ id: "pay-1" });
        prisma.order.findUnique.mockResolvedValue({ id: "ord-cod-1", updatedAt: new Date() });
        return cb(prisma);
      });

      const res = await service.confirmCodRefund("ord-cod-1", {
        transactionReference: "TXN123456",
        notes: "Paid via UPI",
      });

      expect(res.success).toBe(true);
      expect(res.data.status).toBe("COD_REFUNDED");
      expect(res.data.transactionReference).toBe("TXN123456");
      expect(res.data.refundedAt).toBeDefined();
    });

    it("should prevent duplicate COD refund on already returned order", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "ord-cod-1",
        orderNumber: "ORD-COD-1",
        paymentMethod: "COD",
        orderStatus: "RETURNED",
        grandTotal: 1000,
      });

      await expect(
        service.confirmCodRefund("ord-cod-1", {
          transactionReference: "TXN123456",
        }),
      ).rejects.toThrow("Order has already been marked as returned / refunded");
    });
  });

  describe('processRefund', () => {
    it('should process full refund and create RefundAudit record', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        userId: 'usr-1',
        grandTotal: 1500,
        paymentMethod: PaymentMethodEnum.CARD,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.orderReturn.findFirst.mockResolvedValue({ id: 'ret-1' });
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
      prisma.orderReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processRefund('ord-1', {
        reason: 'Damaged item',
      }, 'admin-123');

      expect(result.success).toBe(true);
      expect(result.data.refundAmount).toBe(1500);
      expect(result.data.reason).toBe('Damaged item');
      expect(prisma.refundAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'ord-1',
            userId: 'usr-1',
            amount: 1500,
            status: 'REFUND_INITIATED',
            initiatedByAdminId: 'admin-123',
          }),
        }),
      );
    });

    it('should get order refund history for admin', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        grandTotal: 1500,
      });

      prisma.refundAudit.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          orderId: 'ord-1',
          orderReturnId: 'ret-1',
          amount: 1500,
          currency: 'INR',
          refundMethod: 'COD',
          status: 'COD_REFUNDED',
          provider: 'MANUAL',
          providerRefundId: null,
          transactionReference: 'TXN999',
          actorType: 'ADMIN',
          initiatedByAdminId: 'admin-1',
          confirmedByAdminId: 'admin-1',
          initiatedAt: new Date(),
          completedAt: new Date(),
          failedAt: null,
          failureReason: null,
          failureCode: null,
          createdAt: new Date(),
        },
      ]);

      const res = await service.getOrderRefundHistory('ord-1');

      expect(res.success).toBe(true);
      expect(res.summary.totalRefunded).toBe(1500);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].transactionReference).toBe('TXN999');
    });

    it('should throw BadRequestException if refund amount exceeds grand total', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'ord-1',
        grandTotal: 1000,
      });

      await expect(
        service.processRefund('ord-1', { amount: 1500, reason: 'Overcharge' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOrderInvoice', () => {
    it('should generate structured tax invoice with GST breakdown', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        subtotal: 1000,
        gstPercentage: 18,
        gstAmount: 180,
        deliveryFee: 50,
        grandTotal: 1050,
        paymentMethod: PaymentMethodEnum.UPI,
        paymentStatus: PaymentStatusEnum.COMPLETED,
        createdAt: new Date('2026-08-11T09:00:00.000Z'),
        user: { id: 'u1', name: 'John Doe', email: 'john@example.com' },
        address: { buildingStreet: '123 Main St', city: 'Pune', pincode: '411001' },
        items: [
          {
            id: 'item-1',
            productId: 'p1',
            productName: 'Cat Food',
            variantName: '500g',
            quantity: 2,
            price: 500,
            totalPrice: 1000,
          },
        ],
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);

      const result = await service.getOrderInvoice('ord-1');

      expect(result.success).toBe(true);
      expect(result.data.invoiceNumber).toBe('INV-ORD-1001');
      expect(result.data.summary.subtotal).toBe(1000);
      expect(result.data.summary.taxBreakdown.totalTax).toBe(180); // 18% of 1000
      expect(result.data.summary.taxBreakdown.cgst).toBe(90);
      expect(result.data.summary.taxBreakdown.sgst).toBe(90);
      expect(result.data.items[0].taxAmount).toBe(180);
    });
  });

  describe('getPackingSlip', () => {
    it('should generate warehouse fulfillment packing slip', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        createdAt: new Date('2026-08-11T09:00:00.000Z'),
        user: { name: 'Alice Smith', phone: '+919876543210' },
        address: { houseFlat: '101', buildingStreet: 'Green Towers', city: 'Mumbai', pincode: '400001' },
        deliverySlot: 'Evening (5PM - 9PM)',
        deliveryInstructions: 'Leave with security',
        courierPartner: 'Delhivery',
        trackingNumber: 'DEL-998877',
        items: [
          { productId: 'p1', variantId: 'v1', productName: 'Pet Toy', variantName: 'Red', quantity: 2 },
          { productId: 'p2', variantId: null, productName: 'Pet Shampoo', variantName: null, quantity: 1 },
        ],
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);

      const result = await service.getPackingSlip('ord-1');

      expect(result.success).toBe(true);
      expect(result.data.slipNumber).toBe('PACK-ORD-1001');
      expect(result.data.totalUnitsCount).toBe(3);
      expect(result.data.packageItems.length).toBe(2);
      expect(result.data.packageItems[0].productName).toBe('Pet Toy');
      expect(result.data.packageItems[0].picked).toBe(false);
    });
  });
});
