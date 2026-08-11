import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrderStatusEnum, PaymentMethodEnum } from '@prisma/client';
import { AnalyticsGroupByEnum } from './dto/admin-analytics.dto';

describe('Admin AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
    },
    orderReturn: {
      count: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSalesAnalytics', () => {
    it('should aggregate sales volume, units sold, and chart data', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          grandTotal: 1000,
          paymentMethod: PaymentMethodEnum.UPI,
          createdAt: new Date('2026-08-10T10:00:00Z'),
          items: [{ quantity: 2, totalPrice: 1000 }],
        },
        {
          id: 'ord-2',
          grandTotal: 500,
          paymentMethod: PaymentMethodEnum.CARD,
          createdAt: new Date('2026-08-10T14:00:00Z'),
          items: [{ quantity: 1, totalPrice: 500 }],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getSalesAnalytics({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-11',
        groupBy: AnalyticsGroupByEnum.DAY,
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalSalesAmount).toBe(1500);
      expect(result.data.summary.totalOrders).toBe(2);
      expect(result.data.summary.totalUnitsSold).toBe(3);
      expect(result.data.summary.averageOrderValue).toBe(750);
      expect(result.data.chartData.length).toBe(1);
      expect(result.data.chartData[0].salesAmount).toBe(1500);
      expect(result.data.topSalesByPaymentMethod.length).toBe(2);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should calculate gross, net, refund revenue, and period comparisons', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          grandTotal: 1200,
          subtotal: 1100,
          deliveryFee: 100,
          orderStatus: OrderStatusEnum.DELIVERED,
          paymentMethod: PaymentMethodEnum.UPI,
          createdAt: new Date('2026-08-10T10:00:00Z'),
        },
        {
          id: 'ord-2',
          grandTotal: 300,
          subtotal: 300,
          deliveryFee: 0,
          orderStatus: OrderStatusEnum.CANCELLED,
          paymentMethod: PaymentMethodEnum.CARD,
          createdAt: new Date('2026-08-10T11:00:00Z'),
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 1000 } });
      prisma.orderReturn.count.mockResolvedValue(0);

      const result = await service.getRevenueAnalytics({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-11',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.grossRevenue).toBe(1200);
      expect(result.data.summary.refundedAmount).toBe(300);
      expect(result.data.summary.netRevenue).toBe(900);
      expect(result.data.summary.deliveryFeeRevenue).toBe(100);
      expect(result.data.periodComparison.currentPeriodRevenue).toBe(1200);
      expect(result.data.periodComparison.previousPeriodRevenue).toBe(1000);
      expect(result.data.periodComparison.growthRatePercentage).toBe(20);
    });
  });

  describe('getOrderAnalytics', () => {
    it('should return order lifecycle rates, status distribution, and hourly distribution', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderStatus: OrderStatusEnum.DELIVERED,
          grandTotal: 800,
          createdAt: new Date('2026-08-10T10:00:00Z'),
        },
        {
          id: 'ord-2',
          orderStatus: OrderStatusEnum.SHIPPED,
          grandTotal: 400,
          createdAt: new Date('2026-08-10T12:00:00Z'),
        },
        {
          id: 'ord-3',
          orderStatus: OrderStatusEnum.CANCELLED,
          grandTotal: 300,
          createdAt: new Date('2026-08-10T14:00:00Z'),
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getOrderAnalytics({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-11',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalOrders).toBe(3);
      expect(result.data.summary.deliveredCount).toBe(1);
      expect(result.data.summary.shippedCount).toBe(1);
      expect(result.data.summary.cancelledCount).toBe(1);
      expect(result.data.summary.fulfillmentRatePercentage).toBe(66.7);
      expect(result.data.summary.cancellationRatePercentage).toBe(33.3);
      expect(result.data.hourlyDistribution.length).toBe(24);
      expect(result.data.statusDistribution.length).toBe(3);
    });
  });

  describe('getCustomerAnalytics', () => {
    it('should calculate customer acquisition, retention, and top spenders', async () => {
      prisma.user.count.mockResolvedValue(50);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', createdAt: new Date('2026-08-05') },
        { id: 'u2', createdAt: new Date('2026-08-08') },
      ]);
      prisma.order.findMany.mockResolvedValue([
        {
          userId: 'u1',
          grandTotal: 1500,
          createdAt: new Date('2026-08-06'),
          user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          userId: 'u1',
          grandTotal: 1000,
          createdAt: new Date('2026-08-09'),
          user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
        },
      ]);

      const result = await service.getCustomerAnalytics({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-11',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalCustomersInSystem).toBe(50);
      expect(result.data.summary.newCustomersInPeriod).toBe(2);
      expect(result.data.summary.activeCustomersInPeriod).toBe(1);
      expect(result.data.summary.repeatCustomersCount).toBe(1);
      expect(result.data.summary.customerRetentionRatePercentage).toBe(100);
      expect(result.data.topCustomersBySpend.length).toBe(1);
      expect(result.data.topCustomersBySpend[0].totalSpent).toBe(2500);
    });
  });

  describe('getProductAnalytics', () => {
    it('should return top selling products, categories, and low stock warnings', async () => {
      const mockItems = [
        {
          productId: 'p1',
          productName: 'Cat Kibble',
          quantity: 5,
          totalPrice: 1500,
          product: {
            id: 'p1',
            name: 'Cat Kibble',
            slug: 'cat-kibble',
            stock: 25,
            category: { id: 'c1', name: 'Food' },
            media: [{ url: 'https://example.com/cat.jpg' }],
          },
        },
        {
          productId: 'p2',
          productName: 'Dog Leash',
          quantity: 2,
          totalPrice: 600,
          product: {
            id: 'p2',
            name: 'Dog Leash',
            slug: 'dog-leash',
            stock: 4,
            category: { id: 'c2', name: 'Accessories' },
            media: [],
          },
        },
      ];

      const mockProducts = [
        {
          id: 'p1',
          name: 'Cat Kibble',
          slug: 'cat-kibble',
          stock: 25,
          category: { id: 'c1', name: 'Food' },
          media: [{ url: 'https://example.com/cat.jpg' }],
        },
        {
          id: 'p2',
          name: 'Dog Leash',
          slug: 'dog-leash',
          stock: 4,
          category: { id: 'c2', name: 'Accessories' },
          media: [],
        },
      ];

      prisma.orderItem.findMany.mockResolvedValue(mockItems);
      prisma.product.count
        .mockResolvedValueOnce(30) // active
        .mockResolvedValueOnce(2) // out of stock
        .mockResolvedValueOnce(5); // low stock

      prisma.product.findMany
        .mockResolvedValueOnce(mockProducts) // distinct products
        .mockResolvedValueOnce([
          { id: 'p2', name: 'Dog Leash', slug: 'dog-leash', stock: 4, category: { name: 'Accessories' } },
        ]); // low stock alerts

      const result = await service.getProductAnalytics({ limit: 5 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalActiveProducts).toBe(30);
      expect(result.data.summary.outOfStockCount).toBe(2);
      expect(result.data.summary.lowStockCount).toBe(5);
      expect(result.data.summary.totalUnitsSoldInPeriod).toBe(7);
      expect(result.data.summary.topPerformingProduct).toBe('Cat Kibble');
      expect(result.data.topSellingProducts.length).toBe(2);
      expect(result.data.topSellingCategories.length).toBe(2);
      expect(result.data.lowStockAlerts.length).toBe(1);
    });
  });
});
