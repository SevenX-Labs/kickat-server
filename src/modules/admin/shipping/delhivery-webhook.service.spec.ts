import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from "@prisma/client";
import {
  DelhiveryWebhookService,
  DELHIVERY_STATUS_MAP,
} from "./delhivery-webhook.service";

describe("DelhiveryWebhookService", () => {
  let service: DelhiveryWebhookService;
  let prisma: any;
  let configService: any;
  let notificationsService: any;
  let trackingEventsService: any;

  const mockOrder = {
    id: "ord-delhivery-123",
    orderNumber: "ORD-DEL-001",
    userId: "user-del-1",
    orderStatus: OrderStatusEnum.PACKED,
    trackingNumber: "DEL1234567890",
    shiprocketShipmentId: "DEL1234567890",
    shippingProvider: "DELHIVERY",
    courierPartner: "Delhivery",
    deliveryDate: null,
  };

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        updateMany: jest.fn(),
      },
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === "DELHIVERY_WEBHOOK_SECRET") return "delhivery_test_secret_123";
        return null;
      }),
    };

    notificationsService = {
      notifyOrderStatusChange: jest.fn(),
    };

    trackingEventsService = {
      recordEvents: jest.fn().mockResolvedValue([]),
    };

    service = new DelhiveryWebhookService(
      prisma,
      configService,
      notificationsService,
      trackingEventsService,
    );
  });

  describe("1. Authentication Verification", () => {
    it("accepts valid secret in X-Delhivery-Secret header", () => {
      const headers = { "x-delhivery-secret": "delhivery_test_secret_123" };
      expect(service.verifyAuthentication(headers)).toBe(true);
    });

    it("accepts valid secret in Authorization: Bearer header", () => {
      const headers = { authorization: "Bearer delhivery_test_secret_123" };
      expect(service.verifyAuthentication(headers)).toBe(true);
    });

    it("accepts valid secret in Authorization: Token header", () => {
      const headers = { authorization: "Token delhivery_test_secret_123" };
      expect(service.verifyAuthentication(headers)).toBe(true);
    });

    it("throws UnauthorizedException on missing secret header", () => {
      const headers = {};
      expect(() => service.verifyAuthentication(headers)).toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException on mismatching secret", () => {
      const headers = { "x-delhivery-secret": "wrong_secret" };
      expect(() => service.verifyAuthentication(headers)).toThrow(
        UnauthorizedException,
      );
    });

    it("allows execution in dev environment if secret is not set", () => {
      configService.get.mockReturnValue(null);
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      try {
        expect(service.verifyAuthentication({})).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("throws UnauthorizedException in production if secret is not set", () => {
      configService.get.mockReturnValue(null);
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        expect(() => service.verifyAuthentication({})).toThrow(
          UnauthorizedException,
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("does not authenticate against DELHIVERY_API_KEY when DELHIVERY_WEBHOOK_SECRET is unset", () => {
      configService.get.mockImplementation((key: string) => {
        if (key === "DELHIVERY_API_KEY") return "delhivery_api_token_abc";
        return null;
      });
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const headers = { "x-delhivery-secret": "delhivery_api_token_abc" };
        expect(() => service.verifyAuthentication(headers)).toThrow(
          UnauthorizedException,
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("verifies webhook with independent DELHIVERY_WEBHOOK_SECRET in production", () => {
      configService.get.mockImplementation((key: string) => {
        if (key === "DELHIVERY_WEBHOOK_SECRET") return "delhivery_dedicated_secret_777";
        if (key === "DELHIVERY_API_KEY") return "delhivery_api_token_abc";
        return null;
      });
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const validHeaders = { "x-delhivery-secret": "delhivery_dedicated_secret_777" };
        expect(service.verifyAuthentication(validHeaders)).toBe(true);

        const invalidHeaders = { "x-delhivery-secret": "delhivery_api_token_abc" };
        expect(() => service.verifyAuthentication(invalidHeaders)).toThrow(
          UnauthorizedException,
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe("2. Payload & Order Resolution", () => {
    it("handles dashboard ping probe gracefully without throwing", async () => {
      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {},
      });

      expect(result.success).toBe(true);
      expect(result.test).toBe(true);
      expect(result.matched).toBe(false);
    });

    it("resolves order by Delhivery AWB number", async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "In Transit",
              StatusDateTime: "2026-10-16T10:00:00Z",
              StatusLocation: "Kolkata Hub",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(mockOrder.id);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { trackingNumber: "DEL1234567890" },
              { shiprocketShipmentId: "DEL1234567890" },
            ],
          },
        }),
      );
    });

    it("resolves order by ReferenceNo / OrderNo fallback", async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.SHIPPED,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            ReferenceNo: "ORD-DEL-001",
            Status: {
              Status: "In Transit",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(mockOrder.id);
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { orderNumber: "ORD-DEL-001" },
        include: expect.any(Object),
      });
    });

    it("returns matched=false and logs unmatched event for unknown AWB", async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      prisma.order.findUnique.mockResolvedValue(null);

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "UNKNOWN_AWB_999",
            Status: {
              Status: "In Transit",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.matched).toBe(false);
      expect(prisma.webhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "UNMATCHED",
          }),
        }),
      );
    });
  });

  describe("3. Status Progression & Idempotency", () => {
    it("advances order status from PACKED to OUT_FOR_DELIVERY", async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.PACKED,
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "Out for Delivery",
              StatusDateTime: "2026-10-16T12:00:00Z",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
          }),
        }),
      );
      expect(notificationsService.notifyOrderStatusChange).toHaveBeenCalled();
    });

    it("advances order status to DELIVERED and marks COD payment as COMPLETED", async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        paymentMethod: PaymentMethodEnum.COD,
        paymentStatus: PaymentStatusEnum.PENDING,
        orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        paymentMethod: PaymentMethodEnum.COD,
        paymentStatus: PaymentStatusEnum.COMPLETED,
        orderStatus: OrderStatusEnum.DELIVERED,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "Delivered",
              StatusType: "DL",
              StatusDateTime: "2026-10-16T14:30:00Z",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.DELIVERED,
            paymentStatus: PaymentStatusEnum.COMPLETED,
          }),
        }),
      );
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { orderId: mockOrder.id, status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.COMPLETED },
      });
    });

    it("advances order status to DELIVERED when StatusType is DL", async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "Delivered",
              StatusType: "DL",
              StatusDateTime: "2026-10-16T14:30:00Z",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.DELIVERED,
            deliveryDate: expect.any(Date),
          }),
        }),
      );
    });

    it("prevents backward transition (DELIVERED -> IN TRANSIT)", async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.DELIVERED,
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "In Transit",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(notificationsService.notifyOrderStatusChange).not.toHaveBeenCalled();
    });

    it("identifies duplicate events idempotently and avoids re-processing", async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.webhookLog.findUnique.mockResolvedValue({
        id: "existing-log-1",
        eventId: "delhivery_ord-delhivery-123_DEL1234567890_In Transit_2026-10-16T10:00:00Z",
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "In Transit",
              StatusDateTime: "2026-10-16T10:00:00Z",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("handles RTO transition safely", async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
      });
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue({
        ...mockOrder,
        orderStatus: OrderStatusEnum.RETURN_INITIATED,
      });

      const result = await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "RTO Initiated",
              StatusType: "RT",
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderStatus: OrderStatusEnum.RETURN_INITIATED,
          }),
        }),
      );
    });

    it("records scan events into OrderTrackingEventsService", async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.webhookLog.findUnique.mockResolvedValue(null);
      prisma.order.update.mockResolvedValue(mockOrder);

      await service.processWebhook({
        headers: { "x-delhivery-secret": "delhivery_test_secret_123" },
        body: {
          Shipment: {
            AWB: "DEL1234567890",
            Status: {
              Status: "In Transit",
              StatusDateTime: "2026-10-16T11:00:00Z",
            },
            Scans: [
              {
                ScanDetail: {
                  Scan: "Reached Hub",
                  ScannedLocation: "Kolkata Sort Facility",
                  ScanDateTime: "2026-10-16T10:00:00Z",
                },
              },
            ],
          },
        },
      });

      expect(trackingEventsService.recordEvents).toHaveBeenCalledWith(
        mockOrder.id,
        expect.arrayContaining([
          expect.objectContaining({
            rawStatus: "Reached Hub",
            location: "Kolkata Sort Facility",
          }),
        ]),
        expect.objectContaining({
          source: "WEBHOOK",
          awb: "DEL1234567890",
        }),
      );
    });
  });
});
