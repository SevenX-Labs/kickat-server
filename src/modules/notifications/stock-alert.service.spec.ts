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
  let claimedKeys: Set<string>;

  beforeEach(async () => {
    claimedKeys = new Set<string>();

    prisma = {
      product: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      systemSetting: { findFirst: jest.fn() },
      notificationLog: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (claimedKeys.has(where.providerMessageId)) {
            return Promise.resolve({ id: "log-1", providerMessageId: where.providerMessageId });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          if (claimedKeys.has(data.providerMessageId)) {
            return Promise.reject(new Error("Unique constraint failed"));
          }
          claimedKeys.add(data.providerMessageId);
          return Promise.resolve({ id: "log-created", ...data });
        }),
      },
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

  it("1. SIMPLE product: 15 -> 10 = one low-stock alert", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
      attributes: { lowStockThreshold: 10 },
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
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

  it("2. SIMPLE product: 10 -> 9 = no duplicate alert", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 10,
      newStock: 9,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("3. SIMPLE product: 9 -> 8 = no duplicate alert", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 9,
      newStock: 8,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("4. SIMPLE product: 8 -> 20 = re-arm (no alert sent during restoration)", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 8,
      newStock: 20,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("5. SIMPLE product: 20 -> 10 = new low-stock alert after re-arming", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
      attributes: { lowStockThreshold: 10 },
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 20,
      newStock: 10,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_LOW_STOCK" })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_LOW_STOCK" })
    );
  });

  it("6. OUT OF STOCK: 5 -> 0 = out-of-stock alert", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 5,
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

  it("7. OUT OF STOCK: 0 -> 0 = no duplicate alert", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 0,
      newStock: 0,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("8. OUT OF STOCK: 0 -> 20 = re-arm (no alert)", async () => {
    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 0,
      newStock: 20,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("9. OUT OF STOCK: 20 -> 0 = new out-of-stock alert", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-1",
      name: "Royal Dog Food",
    });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 20,
      newStock: 0,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_OUT_OF_STOCK" })
    );
    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: "ADMIN_OUT_OF_STOCK" })
    );
  });

  it("10. VARIABLE PRODUCT: Variant A crosses threshold = alert only Variant A", async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "var-1kg",
      name: "1kg",
      attributes: { lowStockThreshold: 10 },
      product: { name: "Royal Dog Food" },
    });

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

  it("11. VARIABLE PRODUCT: Variant B remains healthy (18 -> 15) = no alert", async () => {
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

  it("12. SMS recipient is ONLY ADMIN_ALERT_PHONE", async () => {
    process.env.ADMIN_ALERT_PHONE = "+919876543210";
    prisma.product.findUnique.mockResolvedValue({ id: "prod-1", name: "Royal Dog Food" });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+919876543210" })
    );
  });

  it("13. WhatsApp recipient is ONLY ADMIN_ALERT_PHONE", async () => {
    process.env.ADMIN_ALERT_PHONE = "+919876543210";
    prisma.product.findUnique.mockResolvedValue({ id: "prod-1", name: "Royal Dog Food" });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(whatsappService.sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+919876543210" })
    );
  });

  it("14. Customer contact information is never used", async () => {
    process.env.ADMIN_ALERT_PHONE = "+919999988888";
    prisma.product.findUnique.mockResolvedValue({ id: "prod-1", name: "Royal Dog Food" });

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "customer@example.com" })
    );
    expect(smsService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+919999988888" })
    );
  });

  it("15. Missing admin phone safely skips notification", async () => {
    delete process.env.ADMIN_ALERT_PHONE;
    prisma.systemSetting.findFirst.mockResolvedValue(null);

    await service.evaluateStockChange({
      productId: "prod-1",
      previousStock: 15,
      newStock: 5,
    });

    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it("16. SMS provider failure does not fail stock/order operation", async () => {
    smsService.sendSms.mockRejectedValue(new Error("SMS Provider Timeout"));

    await expect(
      service.evaluateStockChange({
        productId: "prod-1",
        previousStock: 15,
        newStock: 5,
      })
    ).resolves.not.toThrow();
  });

  it("17. WhatsApp provider failure does not fail stock/order operation", async () => {
    whatsappService.sendWhatsapp.mockRejectedValue(new Error("WhatsApp API Error"));

    await expect(
      service.evaluateStockChange({
        productId: "prod-1",
        previousStock: 15,
        newStock: 5,
      })
    ).resolves.not.toThrow();
  });

  it("18. Concurrent duplicate evaluation cannot dispatch duplicate SMS", async () => {
    prisma.product.findUnique.mockResolvedValue({ id: "prod-1", name: "Royal Dog Food" });

    // Call twice concurrently
    await Promise.all([
      service.evaluateStockChange({ productId: "prod-1", previousStock: 15, newStock: 5 }),
      service.evaluateStockChange({ productId: "prod-1", previousStock: 15, newStock: 5 }),
    ]);

    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
  });

  it("19. Concurrent duplicate evaluation cannot dispatch duplicate WhatsApp", async () => {
    prisma.product.findUnique.mockResolvedValue({ id: "prod-1", name: "Royal Dog Food" });

    await Promise.all([
      service.evaluateStockChange({ productId: "prod-1", previousStock: 15, newStock: 5 }),
      service.evaluateStockChange({ productId: "prod-1", previousStock: 15, newStock: 5 }),
    ]);

    expect(whatsappService.sendWhatsapp).toHaveBeenCalledTimes(1);
  });
});
