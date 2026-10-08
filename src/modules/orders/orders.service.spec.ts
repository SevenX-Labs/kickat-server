import { StockAlertService } from "../notifications/stock-alert.service";
import { NotificationsService } from "../notifications/notifications.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { SettingsService } from "../admin/settings/settings.service";
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { CancelReasonEnum } from './dto/cancel-order.dto';
import { ReturnReasonEnum } from './dto/return-order.dto';

describe('OrdersService', () => {
  const mockSettingsServiceForOrders = {
    getTaxSettingsRaw: jest.fn().mockResolvedValue({ gstEnabled: true, gstNumber: "27AABCU9603R1ZM", gstPercentage: 18 }),
  };

  let service: OrdersService;
  let prisma: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '99999999-9999-4999-8999-999999999999';
  const mockOrderId = '22222222-2222-4222-8222-222222222222';
  const mockOrderItemId = '33333333-3333-4333-8333-333333333333';
  const mockProductId = '44444444-4444-4444-8444-444444444444';

  const mockOrder = {
    id: mockOrderId,
    orderNumber: 'ORD-123456',
    userId: mockUserId,
    addressId: 'addr_1',
    paymentMethod: PaymentMethodEnum.UPI,
    paymentStatus: PaymentStatusEnum.COMPLETED,
    orderStatus: OrderStatusEnum.PLACED,
    subtotal: 1000,
    deliveryFee: 49,
    grandTotal: 1049,
    deliveryDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: mockOrderItemId,
        orderId: mockOrderId,
        productId: mockProductId,
        variantId: null,
        quantity: 2,
        price: 500,
        totalPrice: 1000,
        productName: 'Pet Food Premium',
      },
    ],
    address: { id: 'addr_1', city: 'Mumbai', pincode: '400001' },
    payments: [],
    returns: [],
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([mockOrder]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refundAudit: {
        findMany: jest.fn(),
      },
      orderReturn: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'ret_1', userId: mockUserId }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: mockProductId, stock: 50, name: 'Pet Food' }]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cartItem: {
        upsert: jest.fn(),
      },
      orderTrackingEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: StockAlertService, useValue: { evaluateStockChange: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
        { provide: InvoicePdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from("pdf-data")) } },
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: mockSettingsServiceForOrders },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrders', () => {
    it('should return paginated user orders', async () => {
      const res = await service.getOrders(mockUserId, { page: 1, limit: 10 });
      expect(res.success).toBe(true);
      expect(res.orders).toHaveLength(1);
      expect(res.pagination.total).toBe(1);
    });

    it('enriches a whole page of orders in one batched lookup', async () => {
      const secondOrderId = '55555555-5555-4555-8555-555555555555';
      const secondProductId = '66666666-6666-4666-8666-666666666666';

      prisma.order.findMany.mockResolvedValueOnce([
        { ...mockOrder, items: [...mockOrder.items] },
        {
          ...mockOrder,
          id: secondOrderId,
          orderNumber: 'ORD-654321',
          items: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              orderId: secondOrderId,
              productId: secondProductId,
              variantId: null,
              quantity: 1,
              price: 250,
              totalPrice: 250,
              productName: 'Chew Toy',
            },
          ],
        },
      ]);
      prisma.order.count.mockResolvedValueOnce(2);
      prisma.product.findMany.mockResolvedValueOnce([
        { id: mockProductId, slug: 'pet-food-premium', imageUrl: 'food.png', images: [], name: 'Pet Food Premium', brand: 'Acme' },
        { id: secondProductId, slug: 'chew-toy', imageUrl: 'toy.png', images: [], name: 'Chew Toy', brand: 'Chewy' },
      ]);

      const res = await service.getOrders(mockUserId, { page: 1, limit: 10 });

      // One product lookup for the entire page, not one per order
      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.product.findMany.mock.calls[0][0].where.id.in).toEqual(
        expect.arrayContaining([mockProductId, secondProductId]),
      );

      // Each order keeps exactly its own enriched items
      expect(res.orders).toHaveLength(2);
      expect(res.orders[0].items).toHaveLength(1);
      expect(res.orders[0].items[0].orderId).toBe(mockOrderId);
      expect((res.orders[0].items[0] as any).productSlug).toBe('pet-food-premium');
      expect((res.orders[0].items[0] as any).imageUrl).toBe('food.png');
      expect(res.orders[1].items).toHaveLength(1);
      expect(res.orders[1].items[0].orderId).toBe(secondOrderId);
      expect((res.orders[1].items[0] as any).productSlug).toBe('chew-toy');
      expect((res.orders[1].items[0] as any).brand).toBe('Chewy');
    });

    it('handles an empty page without issuing product lookups', async () => {
      prisma.order.findMany.mockResolvedValueOnce([]);
      prisma.order.count.mockResolvedValueOnce(0);
      prisma.product.findMany.mockClear();

      const res = await service.getOrders(mockUserId, { page: 1, limit: 10 });

      expect(res.orders).toEqual([]);
      expect(res.pagination.totalPages).toBe(0);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOrderById', () => {
    it('should throw BadRequestException for invalid UUID', async () => {
      await expect(
        service.getOrderById(mockUserId, 'invalid-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.getOrderById(mockUserId, mockOrderId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        userId: otherUserId,
      });

      await expect(
        service.getOrderById(mockUserId, mockOrderId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return order details for owner', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      const res = await service.getOrderById(mockUserId, mockOrderId);
      expect(res.success).toBe(true);
      expect(res.order.id).toBe(mockOrderId);
    });
  });

  describe('getOrderTimeline', () => {
    it('should return step timeline', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      const res = await service.getOrderTimeline(mockUserId, mockOrderId);
      expect(res.success).toBe(true);
      expect(res.timeline).toBeDefined();
    });
  });

  describe('getOrderTracking', () => {
    it('returns real persisted events chronologically with provider locations', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
        trackingNumber: 'AWB1',
        courierPartner: 'Delhivery',
      });
      prisma.orderTrackingEvent.findMany.mockResolvedValue([
        { rawStatus: 'PICKED UP', stage: 'SHIPPED', description: 'Picked up', location: null, eventAt: new Date('2026-08-11T00:00:00Z'), source: 'WEBHOOK' },
        { rawStatus: 'IN TRANSIT', stage: 'IN_TRANSIT', description: 'Bag received', location: 'Pune_Hub', eventAt: new Date('2026-08-12T00:00:00Z'), source: 'POLL' },
      ]);

      const res = await service.getOrderTracking(mockUserId, mockOrderId);

      expect(prisma.orderTrackingEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orderId: mockOrderId } }),
      );
      expect(res.hasTrackingEvents).toBe(true);
      expect(res.trackingMessage).toBeNull();
      expect(res.events.map((e: any) => e.stage)).toEqual(['SHIPPED', 'IN_TRANSIT']);
      expect(res.timeline.map((t: any) => t.stage)).toEqual(['ORDER_PLACED', 'SHIPPED', 'IN_TRANSIT']);
      expect(res.timeline[1].location).toBeNull();
      expect(res.location).toBe('Pune_Hub');
      expect(res.lastUpdated).toEqual(new Date('2026-08-12T00:00:00Z'));
    });

    it('shows no fabricated hubs, timestamps or locations when no events exist', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
      });
      prisma.orderTrackingEvent.findMany.mockResolvedValue([]);

      const res = await service.getOrderTracking(mockUserId, mockOrderId);

      expect(res.events).toEqual([]);
      expect(res.trackingMessage).toBe('Tracking will appear once the shipment is picked up.');
      expect(res.location).toBeNull();
      const serialized = JSON.stringify(res.timeline);
      expect(serialized).not.toMatch(/Hub|Sorting Facility|Delivery Center/);
      for (const step of res.timeline.slice(1)) {
        expect(step.timestamp).toBeNull();
      }
    });

    it('ends a cancelled order timeline at CANCELLED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
        cancelledAt: new Date('2026-08-12T00:00:00Z'),
      });
      prisma.orderTrackingEvent.findMany.mockResolvedValue([]);

      const res = await service.getOrderTracking(mockUserId, mockOrderId);

      expect(res.timeline[res.timeline.length - 1].stage).toBe('CANCELLED');
      expect(res.timeline.map((t: any) => t.stage)).not.toContain('DELIVERED');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully if in PLACED state', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
      });

      const res = await service.cancelOrder(mockUserId, mockOrderId, {
        reason: CancelReasonEnum.CHANGED_MIND,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(OrderStatusEnum.CANCELLED);
    });

    it('should throw ConflictException if order is already PACKED, SHIPPED or DELIVERED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
      });

      await expect(
        service.cancelOrder(mockUserId, mockOrderId, {
          reason: CancelReasonEnum.CHANGED_MIND,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancellation contract (backend is the source of truth)', () => {
    it('reports cancellable=true with no blocked reason for a pre-shipment order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PROCESSING,
        trackingNumber: null,
        shiprocketShipmentId: null,
      });

      const res = await service.getOrderById(mockUserId, mockOrderId);

      expect(res.order.cancellable).toBe(true);
      expect(res.order.cancellationBlockedReason).toBeNull();
    });

    it('reports cancellable=false once an AWB exists, even in a pre-shipment status', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PROCESSING,
        trackingNumber: 'AWB123',
        shiprocketShipmentId: null,
      });

      const res = await service.getOrderById(mockUserId, mockOrderId);

      expect(res.order.cancellable).toBe(false);
      expect(res.order.cancellationBlockedReason).toContain(
        'handed to the courier',
      );
    });

    it('reports cancellable=true when a provider shipment draft exists but no AWB assigned', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PROCESSING,
        trackingNumber: null,
        shiprocketShipmentId: 'ship-1',
      });

      const res = await service.getOrderById(mockUserId, mockOrderId);

      expect(res.order.cancellable).toBe(true);
      expect(res.order.cancellationBlockedReason).toBeNull();
    });

    it('exposes the backend-owned reason catalog, with requiresNote only on other', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      const res = await service.getOrderById(mockUserId, mockOrderId);

      expect(res.cancellationReasons.map((r: any) => r.code)).toEqual([
        'changed_mind',
        'ordered_by_mistake',
        'found_cheaper',
        'delivery_too_slow',
        'change_items',
        'other',
      ]);
      // Never the code the client used to invent.
      expect(res.cancellationReasons.map((r: any) => r.code)).not.toContain(
        'delivery_delayed',
      );
      for (const option of res.cancellationReasons) {
        expect(typeof option.label).toBe('string');
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.requiresNote).toBe(option.code === 'other');
      }
    });

    it('serves the same catalog on the list and tracking responses', async () => {
      prisma.order.findMany.mockResolvedValue([mockOrder]);
      const list = await service.getOrders(mockUserId, { page: 1, limit: 10 });
      expect(list.cancellationReasons.map((r: any) => r.code)).toContain(
        'change_items',
      );
      expect(list.orders[0].cancellable).toBeDefined();

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.orderTrackingEvent.findMany.mockResolvedValue([]);
      const tracking = await service.getOrderTracking(mockUserId, mockOrderId);
      expect(tracking.cancellationReasons.map((r: any) => r.code)).toContain(
        'change_items',
      );
      expect(tracking.cancellable).toBe(true);
    });

    it('accepts change_items and delivery_too_slow at the endpoint', async () => {
      for (const reason of [
        CancelReasonEnum.CHANGE_ITEMS,
        CancelReasonEnum.DELIVERY_TOO_SLOW,
      ]) {
        jest.clearAllMocks();
        prisma.order.findUnique.mockResolvedValue(mockOrder);
        prisma.order.updateMany.mockResolvedValue({ count: 1 });

        const res = await service.cancelOrder(mockUserId, mockOrderId, {
          reason,
        });

        expect(res.success).toBe(true);
        expect(res.cancelReasonCode).toBe(reason);
        expect(res.cancelReason).not.toBe(reason); // a human label, not the code
      }
    });

    it('rejects "other" without a note', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(
        service.cancelOrder(mockUserId, mockOrderId, {
          reason: CancelReasonEnum.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('still refuses to cancel when an AWB appears concurrently (atomic re-check)', async () => {
      // Guards pass on the order as first read...
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PROCESSING,
        trackingNumber: null,
        shiprocketShipmentId: null,
      });
      // ...but the conditional update matches nothing, because the shipment
      // job assigned an AWB in the meantime.
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelOrder(mockUserId, mockOrderId, {
          reason: CancelReasonEnum.CHANGED_MIND,
        }),
      ).rejects.toThrow(ConflictException);

      // The claim is guarded on the courier AWB (tracking number).
      const where = prisma.order.updateMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { trackingNumber: null },
        { trackingNumber: '' },
      ]);
      // Nothing was restocked by the losing caller.
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('returnOrder', () => {
    it('should throw ConflictException if order is not DELIVERED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PLACED,
      });

      await expect(
        service.returnOrder(mockUserId, mockOrderId, {
          items: [{ orderItemId: mockOrderItemId, reason: ReturnReasonEnum.DAMAGED }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should submit return request if DELIVERED within 7 days', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
        deliveryDate: new Date(),
      });
      prisma.orderReturn.create.mockResolvedValue({ id: 'ret_1' });

      const res = await service.returnOrder(mockUserId, mockOrderId, {
        items: [{ orderItemId: mockOrderItemId, reason: ReturnReasonEnum.DAMAGED }],
      });

      expect(res.success).toBe(true);
      expect(res.returnId).toBe('ret_1');
    });
  });

  describe('reorder', () => {
    it('should add order items to cart if product is in stock', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.product.findMany.mockResolvedValue([
        {
          id: mockProductId,
          stock: 50,
          name: 'Pet Food Premium',
        },
      ]);

      const res = await service.reorder(mockUserId, mockOrderId);
      expect(res.success).toBe(true);
      expect(prisma.cartItem.upsert).toHaveBeenCalled();
    });

    it('should throw ConflictException if product is out of stock', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.product.findMany.mockResolvedValue([
        {
          id: mockProductId,
          stock: 0,
          name: 'Pet Food Premium',
        },
      ]);

      await expect(service.reorder(mockUserId, mockOrderId)).rejects.toThrow(
        ConflictException,
      );
    });
  });


  describe('getOrderRefundHistory', () => {
    it('should throw NotFoundException if order does not exist or belongs to another user', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrderRefundHistory('usr-1', 'ord-999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return customer refund history for order owner without sensitive admin IDs', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        userId: 'usr-1',
        grandTotal: 1500,
      });

      prisma.refundAudit.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          orderId: 'ord-1',
          amount: 1500,
          currency: 'INR',
          refundMethod: 'COD',
          status: 'COD_REFUNDED',
          provider: 'MANUAL',
          transactionReference: 'TXN123456',
          initiatedByAdminId: 'secret-admin-id-123',
          initiatedAt: new Date(),
          completedAt: new Date(),
          failedAt: null,
          failureReason: null,
        },
      ]);

      const res = await service.getOrderRefundHistory('usr-1', 'ord-1');

      expect(res.success).toBe(true);
      expect(res.summary.totalRefunded).toBe(1500);
      expect((res.data[0] as any).initiatedByAdminId).toBeUndefined();
      expect(res.data[0].transactionReference).toBe('TXN123456');
    });
  });

  describe('getReturns', () => {
    it('should return paginated user returns', async () => {
      const res = await service.getReturns(mockUserId, { page: 1, limit: 10 });
      expect(res.success).toBe(true);
      expect(res.returns).toHaveLength(1);
    });
  });

  describe('getReturnById', () => {
    it('should throw BadRequestException if id is invalid UUID', async () => {
      await expect(
        service.getReturnById(mockUserId, 'invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if return not found', async () => {
      prisma.orderReturn.findUnique.mockResolvedValue(null);
      await expect(
        service.getReturnById(mockUserId, mockOrderId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if return belongs to another user', async () => {
      prisma.orderReturn.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: otherUserId,
      });

      await expect(
        service.getReturnById(mockUserId, mockOrderId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return return details for owner', async () => {
      prisma.orderReturn.findUnique.mockResolvedValue({
        id: mockOrderId,
        userId: mockUserId,
        items: [],
      });

      const res = await service.getReturnById(mockUserId, mockOrderId);
      expect(res.success).toBe(true);
      expect(res.return.id).toBe(mockOrderId);
    });
  });
});
