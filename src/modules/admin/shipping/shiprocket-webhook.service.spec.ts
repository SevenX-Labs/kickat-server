import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from "@prisma/client";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";

describe("ShiprocketWebhookService", () => {
  let service: ShiprocketWebhookService;
  let prisma: any;
  let configService: any;
  let notificationsService: any;

  const sampleOrder: any = {
    id: "ord-uuid-1234-5678",
    orderNumber: "ORD-1790711454873-4161",
    userId: "user-123",
    addressId: "addr-123",
    paymentMethod: PaymentMethodEnum.UPI,
    paymentStatus: PaymentStatusEnum.COMPLETED,
    orderStatus: OrderStatusEnum.PLACED,
    subtotal: 1000,
    deliveryFee: 50,
    codFee: 0,
    grandTotal: 1050,
    trackingNumber: null,
    courierPartner: null,
    shippingProvider: "SHIPROCKET",
    shiprocketOrderId: "1620821867",
    shiprocketShipmentId: "1617036672",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: "user-123",
      name: "Test Customer",
      email: "test@example.com",
      phone: "+919876543210",
    },
    address: {
      id: "addr-123",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
      },
      orderReturn: {
        create: jest.fn(),
        update: jest.fn(),
      },
      refundAudit: {
        create: jest.fn(),
        update: jest.fn(),
      },
      product: {
        update: jest.fn(),
      },
      productVariant: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => {
        return callback(prisma);
      }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === "SHIPROCKET_WEBHOOK_SECRET") return "sr_webhook_secret_key_123";
        return null;
      }),
    };

    notificationsService = {
      notifyOrderStatusChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiprocketWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ShiprocketWebhookService>(ShiprocketWebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // 1. Valid Webhook
  it("1. Successfully processes a valid Shiprocket webhook payload", async () => {
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.PLACED,
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.SHIPPED,
      trackingNumber: "AWB-SR-998877",
      courierPartner: "Delhivery",
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: 1617036672,
        order_id: 1620821867,
        awb: "AWB-SR-998877",
        courier_name: "Delhivery",
        current_status: "PICKED UP",
      },
    });

    expect(result.success).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.newStatus).toBe(OrderStatusEnum.SHIPPED);
    expect(result.statusUpdated).toBe(true);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleOrder.id },
        data: expect.objectContaining({
          orderStatus: OrderStatusEnum.SHIPPED,
          trackingNumber: "AWB-SR-998877",
          courierPartner: "Delhivery",
        }),
      }),
    );
  });

  // 2. Authentication Failure
  it("2. Rejects webhook with 401 Unauthorized when secret/key is missing or invalid", async () => {
    expect(() =>
      service.verifyAuthentication({ "x-api-key": "wrong_key" }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verifyAuthentication({}),
    ).toThrow(UnauthorizedException);
  });

  // 2B. Case-insensitive header support
  it("2B. Successfully authenticates with case-insensitive header variants (X-Api-Key, X-API-KEY)", async () => {
    expect(
      service.verifyAuthentication({ "X-Api-Key": "sr_webhook_secret_key_123" }),
    ).toBe(true);
    expect(
      service.verifyAuthentication({ "X-API-KEY": "sr_webhook_secret_key_123" }),
    ).toBe(true);
  });

  // 3. Malformed Payload / Empty Body Handling
  it("3. Safely handles empty or ping payload and acknowledges with HTTP 200", async () => {
    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {},
    });

    expect(result.success).toBe(true);
    expect(result.test).toBe(true);
    expect(result.message).toContain("test ping acknowledged successfully");
  });

  // 4. Missing shipment/order identifiers (Test Webhook from Shiprocket Dashboard)
  it("4. Safely acknowledges Shiprocket test webhook when identifiers are absent", async () => {
    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        event: "test",
        data: {},
      },
    });

    expect(result.success).toBe(true);
    expect(result.test).toBe(true);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  // 5. Shipment ID matching
  it("5. Matches KickAt order via Shiprocket Shipment ID (Priority 1)", async () => {
    prisma.order.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.shiprocketShipmentId === "1617036672") {
        return { ...sampleOrder, orderStatus: OrderStatusEnum.PLACED };
      }
      return null;
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.SHIPPED,
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "IN TRANSIT",
      },
    });

    expect(result.matched).toBe(true);
    expect(result.orderId).toBe(sampleOrder.id);
  });

  // 6. Shiprocket Order ID matching
  it("6. Matches KickAt order via Shiprocket Order ID (Priority 2)", async () => {
    prisma.order.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.shiprocketOrderId === "1620821867") {
        return { ...sampleOrder, orderStatus: OrderStatusEnum.PLACED };
      }
      return null;
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        order_id: "1620821867",
        current_status: "OUT FOR DELIVERY",
      },
    });

    expect(result.matched).toBe(true);
    expect(result.orderId).toBe(sampleOrder.id);
  });

  // 7. AWB matching
  it("7. Matches KickAt order via AWB tracking number (Priority 3)", async () => {
    prisma.order.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.trackingNumber === "AWB-MATCH-7766") {
        return {
          ...sampleOrder,
          trackingNumber: "AWB-MATCH-7766",
          orderStatus: OrderStatusEnum.SHIPPED,
        };
      }
      return null;
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.DELIVERED,
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        awb: "AWB-MATCH-7766",
        current_status: "DELIVERED",
      },
    });

    expect(result.matched).toBe(true);
    expect(result.newStatus).toBe(OrderStatusEnum.DELIVERED);
  });

  // 8. Unknown shipment
  it("8. Safely handles unknown shipment/order and returns 200 without modifying database", async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-unmatched" });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "999999999",
        order_id: "999999999",
        current_status: "IN TRANSIT",
      },
    });

    expect(result.success).toBe(true);
    expect(result.matched).toBe(false);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  // 9. Unknown status
  it("9. Safely handles unknown Shiprocket status without corrupting order status", async () => {
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.SHIPPED,
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.SHIPPED,
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "CUSTOM_UNKNOWN_SHIPROCKET_STATE",
      },
    });

    expect(result.success).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.statusUpdated).toBe(false);
    expect(result.newStatus).toBe(OrderStatusEnum.SHIPPED);
  });

  // 10. Valid forward status transition
  it("10. Valid forward status transition from SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED", async () => {
    // Stage A: SHIPPED -> OUT_FOR_DELIVERY
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.SHIPPED,
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
    });

    const result1 = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "OUT FOR DELIVERY",
      },
    });

    expect(result1.statusUpdated).toBe(true);
    expect(result1.newStatus).toBe(OrderStatusEnum.OUT_FOR_DELIVERY);

    // Stage B: OUT_FOR_DELIVERY -> DELIVERED
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
    });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.DELIVERED,
    });

    const result2 = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "DELIVERED",
      },
    });

    expect(result2.statusUpdated).toBe(true);
    expect(result2.newStatus).toBe(OrderStatusEnum.DELIVERED);
  });

  // 11. Backward status ignored
  it("11. Ignores backward status transitions (e.g. DELIVERED -> IN_TRANSIT, OUT_FOR_DELIVERY -> PICKED_UP)", async () => {
    // Test Case A: DELIVERED -> IN_TRANSIT
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.DELIVERED,
    });
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.DELIVERED,
    });

    const resultA = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "IN TRANSIT",
      },
    });

    expect(resultA.statusUpdated).toBe(false);
    expect(resultA.newStatus).toBe(OrderStatusEnum.DELIVERED);

    // Test Case B: OUT_FOR_DELIVERY -> PICKED_UP
    prisma.order.findFirst.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
    });
    prisma.order.update.mockResolvedValue({
      ...sampleOrder,
      orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
    });

    const resultB = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "PICKED UP",
      },
    });

    expect(resultB.statusUpdated).toBe(false);
    expect(resultB.newStatus).toBe(OrderStatusEnum.OUT_FOR_DELIVERY);
  });

  // 12. Duplicate webhook ignored
  it("12. Gracefully ignores duplicate webhook delivery using persistent WebhookLog", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue({
      id: "existing-log-id",
      eventId: "sr_ord-uuid-1234-5678_1617036672_DELIVERED_",
      event: "SHIPROCKET_DELIVERED",
      status: "SUCCESS",
    });

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "DELIVERED",
      },
    });

    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.message).toContain("already processed");
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  // 13. Existing tracking number is not overwritten by null
  it("13. Does NOT overwrite good existing tracking information with null or empty webhook values", async () => {
    const existingOrderWithTracking = {
      ...sampleOrder,
      trackingNumber: "AWB-VALID-EXISTING-123",
      courierPartner: "Delhivery",
      orderStatus: OrderStatusEnum.SHIPPED,
    };

    prisma.order.findFirst.mockResolvedValue(existingOrderWithTracking);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockImplementation(async ({ data }: any) => ({
      ...existingOrderWithTracking,
      ...data,
    }));

    const result = await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        awb: "", // Empty AWB in webhook
        courier_name: null, // Null courier in webhook
        current_status: "OUT FOR DELIVERY",
      },
    });

    expect(result.statusUpdated).toBe(true);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          trackingNumber: null,
          courierPartner: null,
        }),
      }),
    );
  });

  // 14. Webhook does not create shipment
  it("14. Webhook processing does NOT create any remote or local shipment", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder, orderStatus: OrderStatusEnum.SHIPPED });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "IN TRANSIT",
      },
    });

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  // 15. Webhook does not create AWB
  it("15. Webhook processing does NOT invoke AWB creation logic", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "IN TRANSIT",
      },
    });

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  // 16. Webhook does not generate pickup
  it("16. Webhook processing does NOT generate pickup requests", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "PICKED UP",
      },
    });

    expect(prisma.orderReturn.create).not.toHaveBeenCalled();
  });

  // 17. Webhook does not modify payment
  it("17. Webhook processing does NOT create or modify payment records", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "DELIVERED",
      },
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  // 18. Webhook does not modify refund
  it("18. Webhook processing does NOT create or modify refund records", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "RTO INITIATED",
      },
    });

    expect(prisma.refundAudit.create).not.toHaveBeenCalled();
    expect(prisma.refundAudit.update).not.toHaveBeenCalled();
  });

  // 19. Webhook does not modify inventory
  it("19. Webhook processing does NOT modify product stock or inventory", async () => {
    prisma.order.findFirst.mockResolvedValue(sampleOrder);
    prisma.webhookLog.findUnique.mockResolvedValue(null);
    prisma.webhookLog.create.mockResolvedValue({ id: "log-1" });
    prisma.order.update.mockResolvedValue({ ...sampleOrder });

    await service.processWebhook({
      headers: { "x-api-key": "sr_webhook_secret_key_123" },
      body: {
        shipment_id: "1617036672",
        current_status: "DELIVERED",
      },
    });

    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });
});
