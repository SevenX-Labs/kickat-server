import { Test, TestingModule } from "@nestjs/testing";
import { StockAlertService } from "./stock-alert.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

describe("StockAlertService", () => {
  let service: StockAlertService;
  let prisma: any;
  let smsService: any;
  let whatsappService: any;

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      systemSetting: { findFirst: jest.fn() },
      notificationLog: { findFirst: jest.fn(), create: jest.fn() },
    };

    smsService = {
      sendSms: jest.fn().mockResolvedValue({ success: true }),
    };

    whatsappService = {
      sendWhatsapp: jest.fn().mockResolvedValue({ success: true }),
    };

    process.env.ADMIN_ALERT_PHONE = "+919876543210";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockAlertService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    service = module.get<StockAlertService>(StockAlertService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("1. SIMPLE product: stock 11 -> 10, threshold 10 sends SMS + WhatsApp to admin", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
      attributes: { lowStockThreshold: 10 },
    });
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 11,
      newStock: 10,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "+919876543210",
        templateCode: "ADMIN_LOW_STOCK",
        message: expect.stringContaining("Royal Dog Food"),
      })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "+919876543210",
        templateCode: "ADMIN_LOW_STOCK",
        message: expect.stringContaining("Royal Dog Food"),
      })
    );
  });

  it("2. SIMPLE product: 10 -> 9 does NOT send duplicate low-stock alert", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
      attributes: { lowStockThreshold: 10 },
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 10,
      newStock: 9,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("3. SIMPLE product: 9 -> 5 does NOT send duplicate low-stock alert", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 9,
      newStock: 5,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("4. SIMPLE product: 5 -> 30 re-arms alert (no alert sent during restoration)", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 5,
      newStock: 30,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("5. SIMPLE product: 30 -> 10 sends a new low-stock alert after re-arming", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
      attributes: { lowStockThreshold: 10 },
    });
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 30,
      newStock: 10,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_LOW_STOCK" })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_LOW_STOCK" })
    );
  });

  it("6. OUT OF STOCK: 1 -> 0 sends separate OUT_OF_STOCK SMS + WhatsApp", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
    });
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 1,
      newStock: 0,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: "ADMIN_OUT_OF_STOCK",
        message: expect.stringContaining("Out of Stock Alert"),
      })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: "ADMIN_OUT_OF_STOCK",
        message: expect.stringContaining("Out of Stock Alert"),
      })
    );
  });

  it("7. LOW -> OUT: low-stock alert sent previously, reaching 0 sends OUT_OF_STOCK alert", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
    });
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 5,
      newStock: 0,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_OUT_OF_STOCK" })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_OUT_OF_STOCK" })
    );
  });

  it("8. VARIABLE PRODUCT: only affected low-stock variant triggers alert", async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "var-1kg",
      name: "1kg",
      attributes: { lowStockThreshold: 10 },
      product: { name: "Royal Dog Food" },
    });
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      variantId: "var-1kg",
      previousStock: 12,
      newStock: 5,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Variant: 1kg"),
      })
    );
  });

  it("9. Another healthy variant (stock 18 -> 15) must not trigger alert", async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "var-2kg",
      name: "2kg",
      attributes: { lowStockThreshold: 10 },
      product: { name: "Royal Dog Food" },
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      variantId: "var-2kg",
      previousStock: 18,
      newStock: 15,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it("10. Missing admin phone number: operation succeeds, notification safely skipped", async () => {
    delete process.env.ADMIN_ALERT_PHONE;
    prisma.systemSetting.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it("11. SMS failure: stock/order operation still succeeds without throwing", async () => {
    smsService.sendSms.mockRejectedValue(new Error("SMS Provider Timeout"));
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await expect(
      service.evaluateStockChange({
        productId: "prod-1",
        previousStock: 15,
        newStock: 5,
      })
    ).resolves.not.toThrow();
  });

  it("12. WhatsApp failure: stock/order operation still succeeds without throwing", async () => {
    whatsappService.sendWhatsapp.mockRejectedValue(new Error("WhatsApp API Error"));
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await expect(
      service.evaluateStockChange({
        productId: "prod-1",
        previousStock: 15,
        newStock: 5,
      })
    ).resolves.not.toThrow();
  });

  it("13. Idempotency: duplicate alert calls for same event are skipped", async () => {
    prisma.notificationLog.findFirst.mockResolvedValue({ id: "log-1" });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("14. Stock restoration itself (stock 0 -> 20) should not send alert", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 0,
      newStock: 20,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it("15. Verify NO customer notification or customer phone is used", async () => {
    process.env.ADMIN_ALERT_PHONE = "+919999999999";
    prisma.notificationLog.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+919999999999" })
    );
  });
});
