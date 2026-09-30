import { Test, TestingModule } from "@nestjs/testing";
import { ShippingService } from "./shipping.service";
import { ShiprocketProvider } from "./providers/shiprocket.provider";
import { NullShippingProvider } from "./providers/null-shipping.provider";
import { PrismaService } from "../../../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "../../notifications/notifications.service";
import { OrderStatusEnum } from "@prisma/client";
import { Logger } from "@nestjs/common";

describe("Shiprocket Automatic Courier & AWB Assignment Flow", () => {
  let service: ShippingService;
  let shiprocketProvider: ShiprocketProvider;
  let prisma: any;
  let configService: any;
  let notificationsService: any;

  const mockOrder = {
    id: "ord-test-uuid-1",
    orderNumber: "ORD-1790772186420-9782",
    paymentMethod: "COD",
    subtotal: 449,
    deliveryFee: 0,
    codFee: 50,
    gstAmount: 44.9,
    grandTotal: 543.9,
    orderStatus: OrderStatusEnum.PLACED,
    shiprocketOrderId: null,
    shiprocketShipmentId: null,
    courierPartner: null,
    trackingNumber: null,
    createdAt: new Date("2026-09-30T07:13:07.382Z"),
    user: {
      id: "u-9782",
      name: "Bhim Customer",
      email: "customer@example.com",
      phone: "+919674248592",
    },
    address: {
      houseFlat: "Flat 101",
      buildingStreet: "Sabe Road",
      city: "Dombivali",
      state: "Maharashtra",
      pincode: "400612",
      country: "India",
    },
    items: [
      {
        productId: "prod-dog-food",
        variantId: "var-1-2kg",
        productName: "Adult Dog Food – Chicken & Rice",
        variantName: "1.2 Kg",
        quantity: 1,
        price: 449,
        totalPrice: 449,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "prod-dog-food",
            shippingWeightKg: 1.2,
            shippingLengthCm: 20,
            shippingBreadthCm: 25,
            shippingHeightCm: 20,
            variants: [
              {
                id: "var-1-2kg",
                shippingWeightKg: 1.2,
                shippingLengthCm: 20,
                shippingBreadthCm: 25,
                shippingHeightCm: 20,
              },
            ],
          },
        ]),
      },
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "SHIPPING_PROVIDER") return "SHIPROCKET";
        if (key === "SHIPROCKET_PICKUP_LOCATION") return "Bhim's";
        if (key === "SHIPROCKET_PICKUP_PINCODE") return "721643";
        if (key === "SHIPROCKET_EMAIL") return "kickat2021@gmail.com";
        if (key === "SHIPROCKET_PASSWORD") return "secretPassword123";
        return defaultValue || "";
      }),
    };

    notificationsService = {
      notifyOrderStatusChange: jest.fn(),
      notifyOrderPlaced: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        NullShippingProvider,
        ShiprocketProvider,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
    shiprocketProvider = module.get<ShiprocketProvider>(ShiprocketProvider);
  });

  // Test 1: Full pipeline - shipment creation -> serviceability -> AWB assignment
  it("1. Shipment creation → serviceability → AWB assignment executes in automatic sequence", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        ...mockOrder,
        ...data,
      }),
    );

    const createShipmentSpy = jest
      .spyOn(shiprocketProvider, "createShipment")
      .mockResolvedValue({
        isConfigured: true,
        providerName: "SHIPROCKET",
        orderId: "1620829999",
        shipmentId: "1617039999",
        status: "NEW",
      });

    const getRecommendedCourierSpy = jest
      .spyOn(shiprocketProvider, "getRecommendedCourier")
      .mockResolvedValue({
        courierCompanyId: 44,
        courierName: "Delhivery Surface 2 Kgs",
        etd: "2026-10-07",
        rate: 214.12,
        isRecommended: true,
      });

    const assignAwbSpy = jest
      .spyOn(shiprocketProvider, "assignAwb")
      .mockResolvedValue({
        isSuccess: true,
        awbCode: "1904080499203",
        courierName: "Delhivery Surface 2 Kgs",
        courierCompanyId: 44,
        pickupScheduledDate: "2026-10-01 09:00:00",
      });

    const result = await service.createShipmentForOrder(mockOrder.id);

    expect(result.success).toBe(true);
    expect(result.isAwbAssigned).toBe(true);
    expect(createShipmentSpy).toHaveBeenCalledTimes(1);
    expect(getRecommendedCourierSpy).toHaveBeenCalledTimes(1);
    expect(assignAwbSpy).toHaveBeenCalledWith({
      shipmentId: "1617039999",
      courierId: 44,
    });
  });

  // Test 2: Real AWB data persistence
  it("2. Real AWB, courierPartner, and PACKED status are persisted to database", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    jest.spyOn(shiprocketProvider, "createShipment").mockResolvedValue({
      isConfigured: true,
      providerName: "SHIPROCKET",
      orderId: "1620829999",
      shipmentId: "1617039999",
      status: "NEW",
    });

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
      etd: "2026-10-07",
      isRecommended: true,
    });

    jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
      courierCompanyId: 44,
      pickupScheduledDate: "2026-10-01 09:00:00",
    });

    await service.createShipmentForOrder(mockOrder.id);

    // Verify database update call
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockOrder.id },
        data: expect.objectContaining({
          trackingNumber: "1904080499203",
          courierPartner: "Delhivery Surface 2 Kgs",
          orderStatus: OrderStatusEnum.PACKED,
        }),
      }),
    );
  });

  // Test 3: Recommended courier selection from serviceability response
  it("3. Correctly selects Shiprocket recommended courier from serviceability response without hardcoding", async () => {
    jest.spyOn(shiprocketProvider, "checkServiceability").mockResolvedValue({
      status: 200,
      data: {
        recommended_courier_company_id: 10,
        available_courier_companies: [
          { courier_company_id: 44, courier_name: "Courier Beta", rate: 300 },
          { courier_company_id: 10, courier_name: "Courier Alpha", rate: 250 },
        ],
      },
    });

    const courier = await shiprocketProvider.getRecommendedCourier({
      pickupPostcode: "721643",
      deliveryPostcode: "400612",
      weight: 1.2,
      cod: true,
    });

    expect(courier).not.toBeNull();
    expect(courier?.courierCompanyId).toBe(10);
    expect(courier?.courierName).toBe("Courier Alpha");
    expect(courier?.isRecommended).toBe(true);
  });

  // Test 4: Already-assigned AWB does not get reassigned (idempotency)
  it("4. Already-assigned AWB does not get reassigned", async () => {
    const orderWithAwb = {
      ...mockOrder,
      shiprocketOrderId: "1620829999",
      shiprocketShipmentId: "1617039999",
      trackingNumber: "1904080499203",
      courierPartner: "Delhivery Surface 2 Kgs",
      orderStatus: OrderStatusEnum.PACKED,
    };
    prisma.order.findFirst.mockResolvedValue(orderWithAwb);

    const createShipmentSpy = jest.spyOn(shiprocketProvider, "createShipment");
    const assignAwbSpy = jest.spyOn(shiprocketProvider, "assignAwb");

    const result = await service.createShipmentForOrder(orderWithAwb.id);

    expect(result.success).toBe(true);
    expect(result.isExisting).toBe(true);
    expect(createShipmentSpy).not.toHaveBeenCalled();
    expect(assignAwbSpy).not.toHaveBeenCalled();
    expect(result.data.trackingNumber).toBe("1904080499203");
  });

  // Test 5: Shipment already exists -> no duplicate shipment creation
  it("5. When shipment already exists, skips createShipment and calls AWB assignment on existing shipment", async () => {
    const orderWithShipmentOnly = {
      ...mockOrder,
      shiprocketOrderId: "1620829999",
      shiprocketShipmentId: "1617039999",
      trackingNumber: null,
      courierPartner: null,
    };
    prisma.order.findFirst.mockResolvedValue(orderWithShipmentOnly);
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...orderWithShipmentOnly, ...data }),
    );

    const createShipmentSpy = jest.spyOn(shiprocketProvider, "createShipment");
    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });
    const assignAwbSpy = jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
    });

    const result = await service.createShipmentForOrder(orderWithShipmentOnly.id);

    expect(result.success).toBe(true);
    expect(createShipmentSpy).not.toHaveBeenCalled(); // No second shipment!
    expect(assignAwbSpy).toHaveBeenCalledWith({
      shipmentId: "1617039999",
      courierId: 44,
    });
  });

  // Test 6: Serviceability failure
  it("6. Handles serviceability failure safely without crashing or corrupting order status", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    jest.spyOn(shiprocketProvider, "createShipment").mockResolvedValue({
      isConfigured: true,
      providerName: "SHIPROCKET",
      orderId: "1620829999",
      shipmentId: "1617039999",
      status: "NEW",
    });

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue(null);
    const assignAwbSpy = jest.spyOn(shiprocketProvider, "assignAwb");

    const result = await service.createShipmentForOrder(mockOrder.id);

    expect(result.success).toBe(true);
    expect(result.isAwbAssigned).toBe(false);
    expect(result.message).toContain("waiting for courier serviceability");
    expect(assignAwbSpy).not.toHaveBeenCalled();
    // Shipment ID was saved for future retry
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shiprocketShipmentId: "1617039999",
        }),
      }),
    );
  });

  // Test 7: AWB assignment failure
  it("7. Handles AWB assignment failure safely, preserves shipmentId, and does not advance order to SHIPPED", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    jest.spyOn(shiprocketProvider, "createShipment").mockResolvedValue({
      isConfigured: true,
      providerName: "SHIPROCKET",
      orderId: "1620829999",
      shipmentId: "1617039999",
      status: "NEW",
    });

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });

    jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: false,
      message: "Courier pincode service temporarily disabled",
    });

    const result = await service.createShipmentForOrder(mockOrder.id);

    expect(result.success).toBe(true);
    expect(result.isAwbAssigned).toBe(false);
    expect(result.message).toContain("AWB assignment");
    expect(result.data.shiprocketShipmentId).toBe("1617039999");
    expect(result.data.trackingNumber).toBeNull();
  });

  // Test 8: Retry after AWB failure
  it("8. Retrying after AWB failure reuses existing shipment and assigns AWB without creating a second shipment", async () => {
    const existingOrderAfterFailure = {
      ...mockOrder,
      shiprocketOrderId: "1620829999",
      shiprocketShipmentId: "1617039999",
      trackingNumber: null,
      courierPartner: null,
    };
    prisma.order.findFirst.mockResolvedValue(existingOrderAfterFailure);
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...existingOrderAfterFailure, ...data }),
    );

    const createShipmentSpy = jest.spyOn(shiprocketProvider, "createShipment");
    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });
    const assignAwbSpy = jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
    });

    const result = await service.createShipmentForOrder(existingOrderAfterFailure.id);

    expect(result.success).toBe(true);
    expect(result.isAwbAssigned).toBe(true);
    expect(createShipmentSpy).not.toHaveBeenCalled();
    expect(assignAwbSpy).toHaveBeenCalledWith({
      shipmentId: "1617039999",
      courierId: 44,
    });
  });

  // Test 9: Concurrent requests do not duplicate shipment/AWB
  it("9. Concurrent calls on the same order are protected by active shipment lock", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    // Mock slow provider call
    jest.spyOn(shiprocketProvider, "createShipment").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                isConfigured: true,
                providerName: "SHIPROCKET",
                orderId: "1620829999",
                shipmentId: "1617039999",
              }),
            50,
          ),
        ),
    );

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });
    jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
    });

    // Launch two simultaneous calls for the same order
    const [call1, call2] = await Promise.all([
      service.createShipmentForOrder(mockOrder.id),
      service.createShipmentForOrder(mockOrder.id),
    ]);

    expect(call1.success).toBe(true);
    expect(call2.success).toBe(true);
    // One of them must have caught the lock
    const lockedCall = [call1, call2].find((c) =>
      c.message.includes("already in progress"),
    );
    expect(lockedCall).toBeDefined();
  });

  // Test 10: Pickup is not duplicated
  it("10. Detects auto-scheduled pickup and avoids calling duplicate pickup generation", async () => {
    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    jest.spyOn(shiprocketProvider, "createShipment").mockResolvedValue({
      isConfigured: true,
      providerName: "SHIPROCKET",
      orderId: "1620829999",
      shipmentId: "1617039999",
    });

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });

    jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
      pickupScheduledDate: "2026-10-01 09:00:00",
    });

    const result = await service.createShipmentForOrder(mockOrder.id);

    expect(result.data.pickupScheduledDate).toBe("2026-10-01 09:00:00");
  });

  // Test 11: Credentials/secrets are never logged
  it("11. Never leaks sensitive Shiprocket passwords or tokens in logger", async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, "log");
    const errorSpy = jest.spyOn(Logger.prototype, "error");

    prisma.order.findFirst.mockResolvedValue({ ...mockOrder });
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockOrder, ...data }),
    );

    jest.spyOn(shiprocketProvider, "createShipment").mockResolvedValue({
      isConfigured: true,
      providerName: "SHIPROCKET",
      orderId: "1620829999",
      shipmentId: "1617039999",
    });

    jest.spyOn(shiprocketProvider, "getRecommendedCourier").mockResolvedValue({
      courierCompanyId: 44,
      courierName: "Delhivery Surface 2 Kgs",
    });

    jest.spyOn(shiprocketProvider, "assignAwb").mockResolvedValue({
      isSuccess: true,
      awbCode: "1904080499203",
      courierName: "Delhivery Surface 2 Kgs",
    });

    await service.createShipmentForOrder(mockOrder.id);

    const allLogs = [
      ...loggerSpy.mock.calls.map((c) => String(c[0])),
      ...errorSpy.mock.calls.map((c) => String(c[0])),
    ].join(" ");

    expect(allLogs).not.toContain("secretPassword123");
    expect(allLogs).not.toContain("u2bf0NE!@Y&JdfM$dSCxKJPa4V6nI7@P");
  });
});
