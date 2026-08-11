import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { ChartGroupByEnum, DashboardPeriodEnum } from './dto/dashboard-query.dto';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    productVariant: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    orderReturn: {
      count: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should calculate stats and growth metrics correctly', async () => {
      // Mock order.aggregate (all-time, today, current period, prev period)
      prisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { grandTotal: 50000 } }) // all-time
        .mockResolvedValueOnce({ _sum: { grandTotal: 2500 }, _count: { id: 5 } }) // today
        .mockResolvedValueOnce({ _sum: { grandTotal: 15000 } }) // current period
        .mockResolvedValueOnce({ _sum: { grandTotal: 10000 } }); // prev period

      // Mock order.count (total, pending, placed, processing, current period, prev period)
      prisma.order.count
        .mockResolvedValueOnce(120) // total
        .mockResolvedValueOnce(2) // pending
        .mockResolvedValueOnce(5) // placed
        .mockResolvedValueOnce(3) // processing
        .mockResolvedValueOnce(25) // current period orders
        .mockResolvedValueOnce(20); // prev period orders

      // Mock user.count (total, current period, prev period, today)
      prisma.user.count
        .mockResolvedValueOnce(300) // total
        .mockResolvedValueOnce(15) // period
        .mockResolvedValueOnce(10) // prev period
        .mockResolvedValueOnce(3); // today

      // Mock product.count (low stock, out of stock)
      prisma.product.count
        .mockResolvedValueOnce(4) // low stock
        .mockResolvedValueOnce(1); // out of stock

      // Mock productVariant.count (low stock, out of stock)
      prisma.productVariant.count
        .mockResolvedValueOnce(2) // low stock
        .mockResolvedValueOnce(0); // out of stock

      // Mock orderReturn.count (pending, total)
      prisma.orderReturn.count
        .mockResolvedValueOnce(3) // pending (INITIATED)
        .mockResolvedValueOnce(8); // total

      const result = await service.getStats({ period: DashboardPeriodEnum.SEVEN_DAYS });

      expect(result.totalRevenue).toBe(50000);
      expect(result.totalOrders).toBe(120);
      expect(result.totalCustomers).toBe(300);
      expect(result.todayOrders).toBe(5);
      expect(result.todayRevenue).toBe(2500);
      expect(result.pendingOrders).toBe(10); // 2 + 5 + 3
      expect(result.pendingOrdersBreakdown).toEqual({
        pending: 2,
        placed: 5,
        processing: 3,
      });
      expect(result.lowStockProducts).toBe(6); // 4 + 2
      expect(result.outOfStockProducts).toBe(1); // 1 + 0
      expect(result.refundRequests).toBe(3);
      expect(result.totalRefundRequests).toBe(8);
      expect(result.periodMetrics.growth.revenuePercentage).toBe(50); // (15000 - 10000) / 10000 * 100
      expect(result.periodMetrics.growth.ordersPercentage).toBe(25); // (25 - 20) / 20 * 100
      expect(result.periodMetrics.growth.customersPercentage).toBe(50); // (15 - 10) / 10 * 100
    });
  });

  describe('getSalesChartData', () => {
    it('should generate sales chart time-series buckets and aggregate orders correctly', async () => {
      const now = new Date();
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          grandTotal: 150.5,
          createdAt: now,
          items: [{ quantity: 2 }, { quantity: 1 }],
        },
        {
          id: 'ord-2',
          grandTotal: 200.0,
          createdAt: now,
          items: [{ quantity: 1 }],
        },
      ]);

      const result = await service.getSalesChartData({
        period: DashboardPeriodEnum.SEVEN_DAYS,
        groupBy: ChartGroupByEnum.DAY,
      });

      expect(result.period).toBe(DashboardPeriodEnum.SEVEN_DAYS);
      expect(result.chartData.length).toBeGreaterThan(0);
      expect(result.summary.totalRevenue).toBe(350.5);
      expect(result.summary.totalOrders).toBe(2);
      expect(result.summary.totalItems).toBe(4);
      expect(result.summary.averageOrderValue).toBe(175.25);
    });
  });

  describe('getRecentOrders', () => {
    it('should fetch and format latest orders with summary info', async () => {
      const date = new Date('2026-08-11T09:00:00.000Z');
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          userId: 'user-1',
          orderStatus: OrderStatusEnum.PLACED,
          paymentStatus: PaymentStatusEnum.COMPLETED,
          paymentMethod: PaymentMethodEnum.UPI,
          subtotal: 500,
          deliveryFee: 50,
          grandTotal: 550,
          createdAt: date,
          updatedAt: date,
          user: {
            id: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+919876543210',
          },
          items: [
            {
              id: 'item-1',
              productId: 'prod-1',
              productName: 'Dog Food',
              variantName: '2kg',
              quantity: 2,
              price: 250,
              totalPrice: 500,
            },
          ],
          payments: [
            {
              id: 'pay-1',
              status: PaymentStatusEnum.COMPLETED,
              paymentMethod: PaymentMethodEnum.UPI,
              amount: 550,
            },
          ],
        },
      ]);

      const result = await service.getRecentOrders({ limit: 5 });

      expect(result.total).toBe(1);
      expect(result.orders[0].orderNumber).toBe('ORD-1001');
      expect(result.orders[0].customer.name).toBe('John Doe');
      expect(result.orders[0].itemsCount).toBe(2);
      expect(result.orders[0].itemsSummary).toBe('Dog Food (2kg) x2');
      expect(result.orders[0].grandTotal).toBe(550);
    });
  });

  describe('getOrderStatusSummary', () => {
    it('should return complete breakdown for all order lifecycle statuses', async () => {
      prisma.order.count.mockResolvedValue(10);
      prisma.order.groupBy.mockResolvedValue([
        {
          orderStatus: OrderStatusEnum.DELIVERED,
          _count: { id: 6 },
          _sum: { grandTotal: 6000 },
        },
        {
          orderStatus: OrderStatusEnum.PENDING,
          _count: { id: 4 },
          _sum: { grandTotal: 4000 },
        },
      ]);

      const result = await service.getOrderStatusSummary();

      expect(result.totalOrders).toBe(10);
      const delivered = result.breakdown.find((b) => b.status === OrderStatusEnum.DELIVERED);
      expect(delivered).toBeDefined();
      expect(delivered?.count).toBe(6);
      expect(delivered?.percentage).toBe(60);
      expect(delivered?.revenue).toBe(6000);

      const pending = result.breakdown.find((b) => b.status === OrderStatusEnum.PENDING);
      expect(pending?.count).toBe(4);
      expect(pending?.percentage).toBe(40);
    });
  });

  describe('getTopSellingCategories', () => {
    it('should aggregate revenue and units sold by category', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        { productId: 'p1', quantity: 3, totalPrice: 900 },
        { productId: 'p2', quantity: 2, totalPrice: 600 },
      ]);

      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          categoryId: 'cat-1',
          category: { id: 'cat-1', name: 'Pet Food', slug: 'pet-food', imageUrl: null },
        },
        {
          id: 'p2',
          categoryId: 'cat-2',
          category: { id: 'cat-2', name: 'Pet Toys', slug: 'pet-toys', imageUrl: null },
        },
      ]);

      const result = await service.getTopSellingCategories({ limit: 5 });

      expect(result.totalCategories).toBe(2);
      expect(result.totalRevenue).toBe(1500);
      expect(result.categories[0].name).toBe('Pet Food');
      expect(result.categories[0].totalRevenue).toBe(900);
      expect(result.categories[0].percentageOfTotal).toBe(60);
      expect(result.categories[1].name).toBe('Pet Toys');
      expect(result.categories[1].totalRevenue).toBe(600);
      expect(result.categories[1].percentageOfTotal).toBe(40);
    });
  });

  describe('getLowStockProducts', () => {
    it('should return low stock products and variants', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Dog Collar',
          slug: 'dog-collar',
          stock: 3,
          price: 199,
          imageUrl: 'collar.png',
          status: 'ACTIVE',
          category: { id: 'cat-1', name: 'Accessories', slug: 'accessories' },
        },
      ]);

      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: 'var-1',
          productId: 'prod-2',
          name: 'Large',
          sku: 'BED-LG',
          stock: 2,
          price: 1200,
          imageUrl: null,
          product: {
            name: 'Pet Bed',
            slug: 'pet-bed',
            imageUrl: 'bed.png',
            status: 'ACTIVE',
            category: { id: 'cat-2', name: 'Comfort', slug: 'comfort' },
          },
        },
      ]);

      prisma.product.count.mockResolvedValue(1);

      const result = await service.getLowStockProducts({ threshold: 5 });

      expect(result.threshold).toBe(5);
      expect(result.items.length).toBe(2);
      expect(result.items[0].name).toBe('Pet Bed - Large'); // stock 2
      expect(result.items[1].name).toBe('Dog Collar'); // stock 3
    });
  });

  describe('getDashboardSummary', () => {
    it('should aggregate and return complete dashboard payload', async () => {
      jest.spyOn(service, 'getStats').mockResolvedValue({
        totalRevenue: 100000,
        totalOrders: 200,
        totalCustomers: 500,
        todayOrders: 10,
        todayRevenue: 5000,
        pendingOrders: 15,
        pendingOrdersBreakdown: { pending: 5, placed: 6, processing: 4 },
        lowStockProducts: 8,
        outOfStockProducts: 2,
        totalInventoryAlerts: 10,
        refundRequests: 2,
        totalRefundRequests: 5,
        periodMetrics: {} as any,
      });

      jest.spyOn(service, 'getSalesChartData').mockResolvedValue({
        period: DashboardPeriodEnum.SEVEN_DAYS,
        groupBy: ChartGroupByEnum.DAY,
        startDate: '',
        endDate: '',
        summary: { totalRevenue: 10000, totalOrders: 20, totalItems: 40, averageOrderValue: 500 },
        chartData: [],
      });

      jest.spyOn(service, 'getOrderStatusSummary').mockResolvedValue({
        totalOrders: 200,
        breakdown: [],
      });

      jest.spyOn(service, 'getTopSellingCategories').mockResolvedValue({
        period: DashboardPeriodEnum.SEVEN_DAYS,
        totalCategories: 3,
        totalRevenue: 50000,
        categories: [],
      });

      jest.spyOn(service, 'getRecentOrders').mockResolvedValue({
        total: 10,
        orders: [],
      });

      jest.spyOn(service, 'getLowStockProducts').mockResolvedValue({
        threshold: 10,
        totalLowStockItems: 10,
        page: 1,
        limit: 10,
        items: [],
      });

      jest.spyOn(service, 'getPaymentMethodSummary').mockResolvedValue({
        totalOrders: 200,
        totalAmount: 100000,
        breakdown: [],
      });

      const result = await service.getDashboardSummary({});

      expect(result.success).toBe(true);
      expect(result.data.summary.totalRevenue).toBe(100000);
      expect(result.data.summary.totalOrders).toBe(200);
      expect(result.data.summary.totalCustomers).toBe(500);
      expect(result.data.summary.todayOrders).toBe(10);
      expect(result.data.summary.pendingOrders).toBe(15);
      expect(result.data.summary.lowStockProducts).toBe(8);
      expect(result.data.summary.refundRequests).toBe(2);
      expect(result.data.salesChart).toBeDefined();
      expect(result.data.orderStatusSummary).toBeDefined();
      expect(result.data.topCategories).toBeDefined();
      expect(result.data.recentOrders).toBeDefined();
      expect(result.data.lowStockProducts).toBeDefined();
      expect(result.data.paymentMethodSummary).toBeDefined();
    });
  });
});
