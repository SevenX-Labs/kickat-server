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
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
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
