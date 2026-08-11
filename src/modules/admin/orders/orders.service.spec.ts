import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { AdminOrderSortEnum, AdminOrdersQueryDto } from './dto/admin-order.dto';

describe('Admin OrdersService', () => {
  let service: OrdersService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    productVariant: {
      update: jest.fn(),
    },
    payment: {
      updateMany: jest.fn(),
    },
    orderReturn: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
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
  });

  describe('cancelOrder', () => {
    it('should cancel order and automatically restock items', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.PLACED,
        items: [
          { productId: 'prod-1', variantId: 'var-1', quantity: 2 },
          { productId: 'prod-2', variantId: null, quantity: 1 },
        ],
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.product.update.mockResolvedValue({});
      prisma.productVariant.update.mockResolvedValue({});
      prisma.order.update.mockResolvedValue({
        ...existingOrder,
        orderStatus: OrderStatusEnum.CANCELLED,
        cancelReason: 'Customer requested',
      });

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
      });

      await expect(
        service.cancelOrder('ord-1', { reason: 'Duplicate' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processRefund', () => {
    it('should process full refund and resolve return requests', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        grandTotal: 1500,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.orderReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processRefund('ord-1', {
        reason: 'Damaged item',
      });

      expect(result.success).toBe(true);
      expect(result.data.refundAmount).toBe(1500);
      expect(result.data.reason).toBe('Damaged item');
      expect(prisma.orderReturn.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'ord-1', status: 'INITIATED' },
        data: { status: 'REFUNDED' },
      });
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
