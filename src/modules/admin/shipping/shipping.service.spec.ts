import { NotificationsService } from "../../notifications/notifications.service";
import { Test, TestingModule } from '@nestjs/testing';
import { ShippingService } from './shipping.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NullShippingProvider } from './providers/null-shipping.provider';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  let configService: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
        ShippingService,
        NullShippingProvider,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
    configService.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === "SHIPROCKET_PICKUP_LOCATION") return "Main Warehouse";
      return defaultValue || "";
    });
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
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

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

  describe("createShipmentForOrder", () => {
    it("should prevent duplicate shipment creation if shiprocketShipmentId already exists on order (idempotency)", async () => {
      const existingShippedOrder = {
        id: "ord-101",
        orderNumber: "ORD-1001",
        shiprocketOrderId: "SR-ORD-1122",
        shiprocketShipmentId: "SR-SHP-3344",
        courierPartner: "Shiprocket",
        trackingNumber: "AWB-12345",
        orderStatus: OrderStatusEnum.PROCESSING,
      };

      prisma.order.findFirst.mockResolvedValue(existingShippedOrder);

      const result = await service.createShipmentForOrder("ORD-1001");

      expect(result.success).toBe(true);
      expect(result.isExisting).toBe(true);
      expect(result.message).toContain("already exists");
      expect(result.data.shiprocketShipmentId).toBe("SR-SHP-3344");
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("should call provider.createShipment and persist shiprocketOrderId and shiprocketShipmentId to database", async () => {
      const mockOrder = {
        id: "ord-102",
        orderNumber: "ORD-1002",
        paymentMethod: "PREPAID",
        subtotal: 500,
        deliveryFee: 50,
        codFee: 0,
        gstAmount: 25,
        grandTotal: 575,
        orderStatus: OrderStatusEnum.PROCESSING,
        shiprocketShipmentId: null,
        user: { id: "u-1", name: "Alice", email: "alice@example.com", phone: "+919876543210" },
        address: { houseFlat: "101", buildingStreet: "Main St", city: "Mumbai", state: "MH", pincode: "400001", country: "India" },
        items: [{ productId: "p-1", productName: "Cat Leash", quantity: 1, price: 500, totalPrice: 500 }],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        shippingProvider: "UNCONFIGURED",
        shiprocketOrderId: "REMOTE-ORD-1",
        shiprocketShipmentId: "REMOTE-SHP-1",
        courierPartner: "Shiprocket",
        trackingNumber: "AWB-9988",
      });

      const provider = service.getShippingProvider();
      jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "REMOTE-ORD-1",
        shipmentId: "REMOTE-SHP-1",
        status: "NEW",
        statusCode: 1,
        awbCode: "AWB-9988",
        courierName: "Blue Dart",
        message: "Created",
      });

      const result = await service.createShipmentForOrder("ORD-1002", { packageDetails: { weight: 1.0 } });

      expect(result.success).toBe(true);
      expect(result.isExisting).toBe(false);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ord-102" },
          data: expect.objectContaining({
            shiprocketOrderId: "REMOTE-ORD-1",
            shiprocketShipmentId: "REMOTE-SHP-1",
          }),
        }),
      );
    });

    it("should throw BadRequestException if order has no address", async () => {
      const mockOrderNoAddress = {
        id: "ord-103",
        orderNumber: "ORD-1003",
        shiprocketShipmentId: null,
        address: null,
        items: [{ productId: "p-1", productName: "Item", quantity: 1, price: 100 }],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrderNoAddress);

      await expect(
        service.createShipmentForOrder("ORD-1003"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if order has no items", async () => {
      const mockOrderNoItems = {
        id: "ord-104",
        orderNumber: "ORD-1004",
        shiprocketShipmentId: null,
        address: { houseFlat: "101", city: "Mumbai" },
        items: [],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrderNoItems);

      await expect(
        service.createShipmentForOrder("ORD-1004"),
      ).rejects.toThrow(BadRequestException);
    });
  });
    describe("createShipmentForOrder Data Hardening & Pre-Shipment Validation", () => {
    const baseMockOrder = {
      id: "ord-200",
      orderNumber: "ORD-2000",
      paymentMethod: "PREPAID",
      subtotal: 1000,
      deliveryFee: 50,
      codFee: 0,
      gstAmount: 50,
      grandTotal: 1100,
      orderStatus: OrderStatusEnum.PROCESSING,
      shiprocketShipmentId: null,
      user: {
        id: "u-200",
        name: "Rahul Sharma",
        email: "rahul.sharma@example.com",
        phone: "+919876543210",
      },
      address: {
        houseFlat: "Flat 4B",
        buildingStreet: "Palm Avenue",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        country: "India",
      },
      items: [
        {
          productId: "prod-1",
          variantId: "var-1",
          productName: "Premium Dog Kibble",
          variantName: "2kg Pack",
          quantity: 2,
          price: 500,
          totalPrice: 1000,
        },
      ],
    };

    beforeEach(() => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === "SHIPROCKET_PICKUP_LOCATION") return "Main Warehouse";
        return defaultValue || "";
      });
      prisma.product.findMany.mockResolvedValue([]);
    });

    it("1. Valid real customer email passes pre-shipment validation", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      const res = await service.createShipmentForOrder("ORD-2000");

      expect(res.success).toBe(true);
      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: expect.objectContaining({
            email: "rahul.sharma@example.com",
          }),
        }),
      );
    });

    it("2. Rejects shipment when customer email is missing", async () => {
      const orderNoEmail = {
        ...baseMockOrder,
        user: { ...baseMockOrder.user, email: null },
      };
      prisma.order.findFirst.mockResolvedValue(orderNoEmail);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        /Valid customer email is required/,
      );
    });

    it("3. Rejects shipment when customer email format is invalid", async () => {
      const orderBadEmail = {
        ...baseMockOrder,
        user: { ...baseMockOrder.user, email: "invalid-email-string" },
      };
      prisma.order.findFirst.mockResolvedValue(orderBadEmail);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        /Valid customer email is required/,
      );
    });

    it("4. Accepts explicitly provided real package weight in options", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000", {
        packageDetails: { weight: 5.5 },
      });

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          packageDetails: expect.objectContaining({ weight: 5.5 }),
        }),
      );
    });

    it("5. Fails when package weight cannot be resolved from products and no option weight given", async () => {
      const orderNoWeightItems = {
        ...baseMockOrder,
        items: [
          {
            productId: "prod-unknown",
            productName: "Simple Leash",
            variantName: "Red",
            quantity: 1,
            price: 200,
            totalPrice: 200,
          },
        ],
      };
      prisma.order.findFirst.mockResolvedValue(orderNoWeightItems);
      prisma.product.findMany.mockResolvedValue([
        { id: "prod-unknown", attributes: null, variants: [] },
      ]);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Shipment weight is required before creating a Shiprocket shipment.",
      );
    });

    it("6. Rejects invalid package weight (<= 0 or NaN)", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);

      await expect(
        service.createShipmentForOrder("ORD-2000", {
          packageDetails: { weight: -1.0 },
        }),
      ).rejects.toThrow(
        "Shipment weight is required before creating a Shiprocket shipment.",
      );
    });

    it("7. Passes real package dimensions to provider when explicitly provided", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000", {
        packageDetails: { weight: 2.0, length: 15, breadth: 10, height: 5 },
      });

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          packageDetails: expect.objectContaining({
            weight: 2.0,
            length: 15,
            breadth: 10,
            height: 5,
          }),
        }),
      );
    });

    it("8. Rejects invalid dimension values (<= 0) provided in options", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);

      await expect(
        service.createShipmentForOrder("ORD-2000", {
          packageDetails: { weight: 2.0, length: -10, breadth: 10, height: 5 },
        }),
      ).rejects.toThrow(/Package dimensions.*must be positive numbers/);
    });

    it("9. Uses configured pickup location when SHIPROCKET_PICKUP_LOCATION is set", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000");

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupLocation: "Main Warehouse",
        }),
      );
    });

    it("10. Fails when pickup location is neither configured in env nor provided in options", async () => {
      configService.get.mockReturnValue(""); // Empty SHIPROCKET_PICKUP_LOCATION
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Shiprocket pickup location is not configured.",
      );
    });

    it("11. Rejects shipment when shipping address or address line is missing", async () => {
      const orderNoAddressLine = {
        ...baseMockOrder,
        address: {
          ...baseMockOrder.address,
          houseFlat: "",
          buildingStreet: "",
        },
      };
      prisma.order.findFirst.mockResolvedValue(orderNoAddressLine);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Shipping address line is required for Shiprocket shipment creation.",
      );
    });

    it("12. Rejects shipment when shipping pincode or city or state is missing", async () => {
      const orderNoPincode = {
        ...baseMockOrder,
        address: { ...baseMockOrder.address, pincode: "" },
      };
      prisma.order.findFirst.mockResolvedValue(orderNoPincode);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Shipping city, state, and pincode are required for Shiprocket shipment creation.",
      );
    });

    it("13. Rejects shipment when order items array is empty", async () => {
      const orderEmptyItems = {
        ...baseMockOrder,
        items: [],
      };
      prisma.order.findFirst.mockResolvedValue(orderEmptyItems);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Order does not have any items associated.",
      );
    });

    it("14. Correctly calculates multi-item total package weight with different units", async () => {
      const multiItemOrder = {
        ...baseMockOrder,
        items: [
          {
            productId: "p-food",
            variantId: "v-1",
            productName: "Cat Kibble",
            variantName: "1.5kg",
            quantity: 2, // 2 * 1.5 = 3.0 kg
            price: 400,
            totalPrice: 800,
          },
          {
            productId: "p-treat",
            variantId: "v-2",
            productName: "Salmon Treats",
            variantName: "500g",
            quantity: 3, // 3 * 0.5 = 1.5 kg
            price: 150,
            totalPrice: 450,
          },
          {
            productId: "p-powder",
            variantId: "v-3",
            productName: "Vitamin Powder",
            variantName: "250 gm",
            quantity: 2, // 2 * 0.25 = 0.5 kg
            price: 100,
            totalPrice: 200,
          },
        ],
      };
      // Total weight: 3.0 + 1.5 + 0.5 = 5.0 kg

      prisma.order.findFirst.mockResolvedValue(multiItemOrder);
      prisma.order.update.mockResolvedValue({
        ...multiItemOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-MULTI",
        shiprocketShipmentId: "SR-SHP-MULTI",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-MULTI",
        shipmentId: "SR-SHP-MULTI",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000");

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          packageDetails: expect.objectContaining({ weight: 5.0 }),
        }),
      );
    });

    it("15. Ensures item quantity directly affects total package weight calculation", async () => {
      const singleItemOrder = {
        ...baseMockOrder,
        items: [
          {
            productId: "p-toy",
            productName: "Chew Toy",
            variantName: "500g",
            quantity: 4, // 4 * 0.5 = 2.0 kg
            price: 200,
            totalPrice: 800,
          },
        ],
      };

      prisma.order.findFirst.mockResolvedValue(singleItemOrder);
      prisma.order.update.mockResolvedValue({
        ...singleItemOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-QTY",
        shiprocketShipmentId: "SR-SHP-QTY",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-QTY",
        shipmentId: "SR-SHP-QTY",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000");

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          packageDetails: expect.objectContaining({ weight: 2.0 }),
        }),
      );
    });

    it("16. Confirms customer email never silently falls back to fake customer@kickat.in", async () => {
      const orderNoEmail = {
        ...baseMockOrder,
        user: { ...baseMockOrder.user, email: null },
      };
      prisma.order.findFirst.mockResolvedValue(orderNoEmail);

      try {
        await service.createShipmentForOrder("ORD-2000");
        fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).not.toContain("customer@kickat.in");
        expect(err.message).toContain("Valid customer email is required");
      }
    });

    it("17. Confirms package weight never silently falls back to fake 0.5 kg", async () => {
      const orderUnknownWeight = {
        ...baseMockOrder,
        items: [
          {
            productId: "p-unknown",
            productName: "Custom Item",
            quantity: 1,
            price: 100,
            totalPrice: 100,
          },
        ],
      };
      prisma.order.findFirst.mockResolvedValue(orderUnknownWeight);

      await expect(service.createShipmentForOrder("ORD-2000")).rejects.toThrow(
        "Shipment weight is required before creating a Shiprocket shipment.",
      );
    });

    it("18. Confirms package dimensions never silently fall back to fake 10x10x10 cm", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000", {
        packageDetails: { weight: 2.0 }, // No length, breadth, height
      });

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          packageDetails: {
            weight: 2.0, // length, breadth, height omitted
          },
        }),
      );
    });

    it("19. Existing shipment on order prevents duplicate creation (idempotency)", async () => {
      const existingShippedOrder = {
        id: "ord-101",
        orderNumber: "ORD-1001",
        shiprocketOrderId: "SR-ORD-1122",
        shiprocketShipmentId: "SR-SHP-3344",
        courierPartner: "Shiprocket",
        trackingNumber: "AWB-12345",
        orderStatus: OrderStatusEnum.PROCESSING,
      };

      prisma.order.findFirst.mockResolvedValue(existingShippedOrder);

      const result = await service.createShipmentForOrder("ORD-1001");

      expect(result.success).toBe(true);
      expect(result.isExisting).toBe(true);
      expect(result.message).toContain("already exists");
    });

    it("20. Valid payload with authoritative order pricing reaches the provider layer", async () => {
      prisma.order.findFirst.mockResolvedValue(baseMockOrder);
      prisma.order.update.mockResolvedValue({
        ...baseMockOrder,
        shippingProvider: "SHIPROCKET",
        shiprocketOrderId: "SR-ORD-2000",
        shiprocketShipmentId: "SR-SHP-2000",
      });

      const provider = service.getShippingProvider();
      const createShipmentSpy = jest.spyOn(provider, "createShipment").mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "SR-ORD-2000",
        shipmentId: "SR-SHP-2000",
        status: "NEW",
        statusCode: 1,
        awbCode: null,
        courierName: null,
        message: "Created",
      });

      await service.createShipmentForOrder("ORD-2000");

      expect(createShipmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 1000,
          deliveryFee: 50,
          taxAmount: 50,
          grandTotal: 1100,
          paymentMethod: "PREPAID",
        }),
      );
    });
  });
});
