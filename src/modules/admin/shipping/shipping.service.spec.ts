import { Test, TestingModule } from '@nestjs/testing';
import { ShippingService } from './shipping.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { OrderStatusEnum } from '@prisma/client';
import {
  AdminShipmentSortEnum,
  AdminShipmentsQueryDto,
  AssignCourierDto,
  UpdateShipmentStatusDto,
} from './dto/admin-shipping.dto';

describe('Admin ShippingService', () => {
  let service: ShippingService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getShipments', () => {
    it('should return paginated shipments with courier, AWB, and KPI counters', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          userId: 'user-1',
          orderStatus: OrderStatusEnum.SHIPPED,
          courierPartner: 'Delhivery',
          trackingNumber: 'DEL-12345',
          estimatedDelivery: new Date('2026-08-15'),
          createdAt: new Date('2026-08-11'),
          updatedAt: new Date('2026-08-11'),
          user: { id: 'user-1', name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
          address: { houseFlat: '101', buildingStreet: 'Main St', city: 'Mumbai', state: 'MH', pincode: '400001' },
          items: [{ productName: 'Dog Food', variantName: '1kg', quantity: 2 }],
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(0) // pending assignment
        .mockResolvedValueOnce(1) // in transit
        .mockResolvedValueOnce(0) // delivered
        .mockResolvedValueOnce(0); // rto

      const query: AdminShipmentsQueryDto = {
        page: 1,
        limit: 10,
        courier: 'Delhivery',
        status: OrderStatusEnum.SHIPPED,
        sort: AdminShipmentSortEnum.CREATED_AT_DESC,
      };

      const result = await service.getShipments(query);

      expect(result.success).toBe(true);
      expect(result.data.shipments.length).toBe(1);
      expect(result.data.shipments[0].shipmentNumber).toBe('SHIP-ORD-1001');
      expect(result.data.shipments[0].courierPartner).toBe('Delhivery');
      expect(result.data.shipments[0].awbNumber).toBe('DEL-12345');
      expect(result.data.shipments[0].trackingUrl).toContain('delhivery.com');
      expect(result.data.summary.totalShipments).toBe(1);
      expect(result.data.summary.inTransitCount).toBe(1);
    });
  });

  describe('getShipmentById', () => {
    it('should return complete shipment details by id or orderNumber or AWB', async () => {
      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.SHIPPED,
        courierPartner: 'Shiprocket',
        trackingNumber: 'SR-998877',
        user: { name: 'Alice' },
        address: { city: 'Pune' },
        items: [{ productName: 'Pet Toy', quantity: 1 }],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getShipmentById('SR-998877');

      expect(result.success).toBe(true);
      expect(result.data.orderNumber).toBe('ORD-1001');
      expect(result.data.courierPartner).toBe('Shiprocket');
      expect(result.data.trackingUrl).toContain('shiprocket.co');
    });

    it('should throw NotFoundException if shipment not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.getShipmentById('NON-EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignCourier', () => {
    it('should assign courier, generate AWB number, and advance status to SHIPPED', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.PACKED,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.order.update.mockResolvedValue({
        ...existingOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
        courierPartner: 'BlueDart',
        trackingNumber: 'AWB-BLU-TEST-1234',
        estimatedDelivery: new Date('2026-08-14'),
      });

      const dto: AssignCourierDto = {
        courierPartner: 'BlueDart',
        awbNumber: 'AWB-BLU-TEST-1234',
      };

      const result = await service.assignCourier('ord-1', dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('assigned successfully');
      expect(result.data.courierPartner).toBe('BlueDart');
      expect(result.data.awbNumber).toBe('AWB-BLU-TEST-1234');
      expect(result.data.status).toBe(OrderStatusEnum.SHIPPED);
    });

    it('should auto-generate AWB if not supplied in assignCourier', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.PROCESSING,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.order.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...existingOrder, ...data }),
      );

      const dto: AssignCourierDto = {
        courierPartner: 'Delhivery',
      };

      const result = await service.assignCourier('ord-1', dto);

      expect(result.success).toBe(true);
      expect(result.data.awbNumber).toMatch(/^AWB-DEL-/);
      expect(result.data.status).toBe(OrderStatusEnum.SHIPPED);
    });
  });

  describe('updateShipmentStatus', () => {
    it('should update delivery status to DELIVERED', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.SHIPPED,
        trackingNumber: 'DEL-12345',
        courierPartner: 'Delhivery',
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.order.update.mockResolvedValue({
        ...existingOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
        updatedAt: new Date(),
      });

      const dto: UpdateShipmentStatusDto = {
        status: OrderStatusEnum.DELIVERED,
        location: 'Mumbai Hub',
      };

      const result = await service.updateShipmentStatus('ord-1', dto);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(OrderStatusEnum.DELIVERED);
      expect(result.data.isRTO).toBe(false);
    });

    it('should set isRTO to true when updating status to RETURN_INITIATED', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.SHIPPED,
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);
      prisma.order.update.mockResolvedValue({
        ...existingOrder,
        orderStatus: OrderStatusEnum.RETURN_INITIATED,
        updatedAt: new Date(),
      });

      const dto: UpdateShipmentStatusDto = {
        status: OrderStatusEnum.RETURN_INITIATED,
        notes: 'Undelivered - customer refused parcel',
      };

      const result = await service.updateShipmentStatus('ord-1', dto);

      expect(result.success).toBe(true);
      expect(result.data.isRTO).toBe(true);
      expect(result.data.notes).toBe('Undelivered - customer refused parcel');
    });
  });

  describe('getShipmentTracking', () => {
    it('should return tracking timeline with checkpoints and courier URL', async () => {
      const existingOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        orderStatus: OrderStatusEnum.SHIPPED,
        courierPartner: 'Delhivery',
        trackingNumber: 'DEL-998877',
        createdAt: new Date('2026-08-10T10:00:00Z'),
        address: { city: 'Pune', state: 'MH', pincode: '411001' },
      };

      prisma.order.findFirst.mockResolvedValue(existingOrder);

      const result = await service.getShipmentTracking('ord-1');

      expect(result.success).toBe(true);
      expect(result.data.shipmentNumber).toBe('SHIP-ORD-1001');
      expect(result.data.courierPartner).toBe('Delhivery');
      expect(result.data.awbNumber).toBe('DEL-998877');
      expect(result.data.timeline.length).toBe(6);
      expect(result.data.timeline[0].stage).toBe('ORDER_PLACED');
      expect(result.data.timeline[0].isCompleted).toBe(true);
      expect(result.data.trackingUrl).toContain('delhivery.com/track');
    });
  });
});
