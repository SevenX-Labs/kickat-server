import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';

describe('Admin ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    orderReturn: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSalesReport', () => {
    it('should return sales report with aggregated figures and paginated records', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          createdAt: new Date('2026-08-10'),
          subtotal: 1000,
          deliveryFee: 50,
          grandTotal: 1050,
          paymentMethod: PaymentMethodEnum.UPI,
          paymentStatus: PaymentStatusEnum.COMPLETED,
          orderStatus: OrderStatusEnum.DELIVERED,
          user: { name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
          items: [{ productName: 'Dog Food', quantity: 2 }],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count.mockResolvedValue(1);
      prisma.order.aggregate.mockResolvedValue({
        _sum: { grandTotal: 1050, subtotal: 1000, deliveryFee: 50 },
      });
      prisma.orderItem.aggregate.mockResolvedValue({
        _sum: { quantity: 2 },
      });

      const result = await service.getSalesReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalSales).toBe(1050);
      expect(result.data.summary.totalUnitsSold).toBe(2);
      expect(result.data.summary.averageOrderValue).toBe(1050);
      expect(result.data.records.length).toBe(1);
      expect(result.data.records[0].orderNumber).toBe('ORD-1001');
    });
  });

  describe('exportSalesReport', () => {
    it('should export sales as CSV text', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          createdAt: new Date('2026-08-10'),
          subtotal: 1000,
          deliveryFee: 50,
          grandTotal: 1050,
          paymentMethod: PaymentMethodEnum.UPI,
          paymentStatus: PaymentStatusEnum.COMPLETED,
          orderStatus: OrderStatusEnum.DELIVERED,
          user: { name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
          items: [{ productName: 'Dog Food', quantity: 2 }],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);

      const csv = await service.exportSalesReport({ format: 'csv' });

      expect(typeof csv).toBe('string');
      expect(csv).toContain('Order Number,Date,Customer Name');
      expect(csv).toContain('ORD-1001');
      expect(csv).toContain('1050');
    });

    it('should export sales as JSON object when format is json', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result: any = await service.exportSalesReport({ format: 'json' });

      expect(result.success).toBe(true);
      expect(result.totalRecords).toBe(0);
      expect(Array.isArray(result.records)).toBe(true);
    });
  });

  describe('getOrdersReport', () => {
    it('should return orders report with lifecycle statistics and delivery destinations', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          createdAt: new Date('2026-08-10'),
          orderStatus: OrderStatusEnum.DELIVERED,
          paymentMethod: PaymentMethodEnum.UPI,
          paymentStatus: PaymentStatusEnum.COMPLETED,
          courierPartner: 'Delhivery',
          trackingNumber: 'DEL-12345',
          grandTotal: 1050,
          user: { id: 'u1', name: 'John Doe', phone: '+919876543210' },
          address: { houseFlat: '101', buildingStreet: 'Main St', city: 'Mumbai', state: 'MH', pincode: '400001' },
          items: [{ productName: 'Dog Food', quantity: 2 }],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // delivered
        .mockResolvedValueOnce(0) // processing
        .mockResolvedValueOnce(0) // shipped
        .mockResolvedValueOnce(0) // cancelled
        .mockResolvedValueOnce(0); // returned

      prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 1050 } });

      const result = await service.getOrdersReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalOrders).toBe(1);
      expect(result.data.summary.deliveredCount).toBe(1);
      expect(result.data.summary.fulfillmentRatePercentage).toBe(100);
      expect(result.data.records.length).toBe(1);
      expect(result.data.records[0].destination).toContain('Mumbai');
    });
  });

  describe('getCustomersReport', () => {
    it('should return customers report with lifetime spend and order metrics', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          phone: '+919876543210',
          isBlocked: false,
          isEmailVerified: true,
          isPhoneVerified: true,
          createdAt: new Date('2026-08-01'),
          _count: { orders: 2, pets: 1 },
          orders: [
            { grandTotal: 1500, createdAt: new Date('2026-08-10') },
            { grandTotal: 500, createdAt: new Date('2026-08-05') },
          ],
        },
      ];

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // new in period

      const result = await service.getCustomersReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalCustomers).toBe(1);
      expect(result.data.summary.newCustomersInPeriod).toBe(1);
      expect(result.data.records[0].totalSpent).toBe(2000);
      expect(result.data.records[0].averageOrderValue).toBe(1000);
    });
  });

  describe('getProductsReport', () => {
    it('should return products movement, stock, and revenue report', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          name: 'Cat Food',
          slug: 'cat-food',
          price: 500,
          stock: 20,
          category: { id: 'c1', name: 'Pet Food' },
        },
      ];

      const mockItems = [{ productId: 'prod-1', quantity: 4, totalPrice: 2000 }];

      prisma.product.findMany.mockResolvedValue(mockProducts);
      prisma.product.count.mockResolvedValue(1);
      prisma.orderItem.findMany.mockResolvedValue(mockItems);

      const result = await service.getProductsReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalProducts).toBe(1);
      expect(result.data.summary.totalUnitsSoldInPeriod).toBe(4);
      expect(result.data.summary.totalRevenueInPeriod).toBe(2000);
      expect(result.data.records[0].stockStatus).toBe('IN_STOCK');
      expect(result.data.records[0].unitsSoldInPeriod).toBe(4);
    });
  });

  describe('getRefundsReport', () => {
    it('should return refund requests, reasons, and amounts', async () => {
      const mockReturns = [
        {
          id: '11111111-1111-4111-a111-111111111111',
          orderId: 'ord-1',
          createdAt: new Date('2026-08-10'),
          status: 'REFUNDED',
          order: {
            id: 'ord-1',
            orderNumber: 'ORD-1001',
            grandTotal: 1200,
            user: { name: 'Alice', email: 'alice@example.com' },
          },
          items: [
            {
              id: 'ret-item-1',
              reason: 'Damaged item',
              orderItem: { productName: 'Pet Collar', quantity: 1 },
            },
          ],
        },
      ];

      prisma.orderReturn.findMany.mockResolvedValue(mockReturns);
      prisma.orderReturn.count.mockResolvedValue(1);
      prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 1200 } });

      const result = await service.getRefundsReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalRefundRequests).toBe(1);
      expect(result.data.summary.totalRefundAmount).toBe(1200);
      expect(result.data.records[0].orderNumber).toBe('ORD-1001');
      expect(result.data.records[0].reason).toBe('Damaged item');
    });
  });

  describe('getGstReport', () => {
    it('should generate compliant GST tax report with 18% CGST/SGST/IGST breakdown', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          createdAt: new Date('2026-08-10'),
          subtotal: 1000,
          grandTotal: 1180,
          paymentMethod: PaymentMethodEnum.UPI,
          user: { name: 'John Doe', email: 'john@example.com' },
          address: { state: 'Maharashtra' },
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count.mockResolvedValue(1);
      prisma.order.aggregate.mockResolvedValue({
        _sum: { subtotal: 1000, grandTotal: 1180 },
      });

      const result = await service.getGstReport({ page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.summary.totalTaxableValue).toBe(1000);
      expect(result.data.summary.totalGstCollected).toBe(180);
      expect(result.data.summary.totalCgstCollected).toBe(90);
      expect(result.data.summary.totalSgstCollected).toBe(90);
      expect(result.data.records[0].cgstAmount).toBe(90);
      expect(result.data.records[0].sgstAmount).toBe(90);
      expect(result.data.records[0].isInterState).toBe(false);
    });
  });
});
