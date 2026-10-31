import { Test, TestingModule } from "@nestjs/testing";
import { CartService, calculateFeesHelper } from "./cart.service";
import { CartCacheService } from "./cart-cache.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../admin/settings/settings.service";
import { RedisService } from "../../common/redis/redis.service";

describe("CartService & Fee Calculation Engine", () => {
  let service: CartService;

  const mockPrismaService = {
    cartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    guestCartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrismaService)),
  };

  const mockSettingsService = {
    getDeliverySettingsRaw: jest.fn().mockResolvedValue({
      deliveryFeeEnabled: true,
      deliveryFee: 49,
      freeDeliveryThreshold: 500,
      extraFeeEnabled: true,
      extraFeeName: "Handling Fee",
      extraFeeAmount: 15,
      isExtraFeeCompulsory: true,
    }),
    getTaxSettingsRaw: jest.fn().mockResolvedValue({
      gstEnabled: true,
      gstPercentage: 18,
    }),
    getPaymentSettingsRaw: jest.fn().mockResolvedValue({
      cod: { enabled: true, extraFee: 10 },
    }),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn(),
    setNX: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(true),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    hset: jest.fn().mockResolvedValue(true),
    hget: jest.fn().mockResolvedValue(null),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn(),
    hlen: jest.fn().mockResolvedValue(0),
    zincrby: jest.fn().mockResolvedValue('1'),
    zrevrange: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        CartCacheService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("calculateFeesHelper GST Precision & Rounding Edge Cases", () => {
    it("should calculate GST on Selling Price (₹900) instead of MRP (₹1,000) for ONLINE & COD checkouts", () => {
      const delivery = { deliveryFeeEnabled: true, deliveryFee: 50, freeDeliveryThreshold: 1500 };
      const tax = { gstEnabled: true, gstPercentage: 10 };
      const paymentSettings = { cod: { enabled: true, extraFee: 90 } };

      // Selling Price = 900 (MRP = 1000)
      const onlineFees = calculateFeesHelper(900, delivery, tax, false, "ONLINE", paymentSettings);
      expect(onlineFees.subtotal).toBe(900);
      expect(onlineFees.gstAmount).toBe(90); // 10% of 900, NOT 1000
      expect(onlineFees.deliveryFee).toBe(50);
      expect(onlineFees.codFee).toBe(0);
      expect(onlineFees.grandTotal).toBe(1040); // 900 + 90 + 50 + 0

      const codFees = calculateFeesHelper(900, delivery, tax, false, "COD", paymentSettings);
      expect(codFees.subtotal).toBe(900);
      expect(codFees.gstAmount).toBe(90);
      expect(codFees.deliveryFee).toBe(50);
      expect(codFees.codFee).toBe(90);
      expect(codFees.grandTotal).toBe(1130); // 900 + 90 + 50 + 90
    });

    it("should return GST = 0 when GST is disabled in admin settings", () => {
      const delivery = { deliveryFeeEnabled: true, deliveryFee: 50, freeDeliveryThreshold: 1500 };
      const taxDisabled = { gstEnabled: false, gstPercentage: 10 };
      const fees = calculateFeesHelper(900, delivery, taxDisabled, false, "ONLINE");

      expect(fees.gstAmount).toBe(0);
      expect(fees.grandTotal).toBe(950); // 900 + 50
    });

    it("should accurately scale GST for multiple quantities (SP=₹900, Qty=2, GST=10% => Subtotal=1800, GST=180)", () => {
      const delivery = { deliveryFeeEnabled: true, deliveryFee: 50, freeDeliveryThreshold: 1500 };
      const tax = { gstEnabled: true, gstPercentage: 10 };

      const fees = calculateFeesHelper(1800, delivery, tax, false, "ONLINE");
      expect(fees.subtotal).toBe(1800);
      expect(fees.gstAmount).toBe(180);
      expect(fees.deliveryFee).toBe(0); // Subtotal 1800 >= 1500 threshold
      expect(fees.grandTotal).toBe(1980);
    });

    it("should round GST accurately for subtotal=333.33 and gstPercentage=18", () => {
      const delivery = {
        deliveryFeeEnabled: true,
        deliveryFee: 50,
        freeDeliveryThreshold: 500,
        extraFeeEnabled: false,
      };
      const tax = { gstEnabled: true, gstPercentage: 18 };

      // 333.33 * 18 / 100 = 59.9994 -> rounded to 60.00
      const fees = calculateFeesHelper(333.33, delivery, tax);
      expect(fees.gstAmount).toBe(60);
      expect(fees.deliveryFee).toBe(50);
      expect(fees.grandTotal).toBe(443.33); // 333.33 + 50 + 60 = 443.33
    });

    it("should apply free delivery when subtotal >= freeDeliveryThreshold", () => {
      const delivery = {
        deliveryFeeEnabled: true,
        deliveryFee: 50,
        freeDeliveryThreshold: 500,
      };
      const tax = { gstEnabled: false, gstPercentage: 0 };

      const fees = calculateFeesHelper(500, delivery, tax);
      expect(fees.deliveryFee).toBe(0);
      expect(fees.grandTotal).toBe(500);
    });

    it("should handle compulsory vs optional extra fee correctly", () => {
      const deliveryOptional = {
        deliveryFeeEnabled: false,
        extraFeeEnabled: true,
        extraFeeName: "Gift Wrap",
        extraFeeAmount: 25,
        isExtraFeeCompulsory: false,
      };
      const tax = { gstEnabled: false, gstPercentage: 0 };

      // Optional extra fee NOT applied when applyOptionalExtraFee is false
      const feeWithoutOpt = calculateFeesHelper(100, deliveryOptional, tax, false);
      expect(feeWithoutOpt.extraFeeAmount).toBe(0);
      expect(feeWithoutOpt.grandTotal).toBe(100);

      // Optional extra fee applied when applyOptionalExtraFee is true
      const feeWithOpt = calculateFeesHelper(100, deliveryOptional, tax, true);
      expect(feeWithOpt.extraFeeAmount).toBe(25);
      expect(feeWithOpt.grandTotal).toBe(125);
    });
  });

  describe("Guest vs Logged-in Cart Parity", () => {
    it("should produce identical fee breakdown for guest and logged-in cart with identical items", async () => {
      const mockProduct = {
        id: "prod-1",
        name: "Test Item",
        slug: "test-item",
        price: 400,
        discountPrice: 350,
        stock: 10,
        imageUrl: "http://example.com/img.jpg",
        images: [],
        category: null,
      };

      // Redis returns empty (cache miss) → falls through to DB
      mockRedisService.hgetall.mockResolvedValue({});

      mockPrismaService.cartItem.findMany.mockResolvedValue([
        { id: "c1", productId: "prod-1", variantId: null, quantity: 1, createdAt: new Date(), product: mockProduct, variant: null },
      ]);

      mockPrismaService.guestCartItem.findMany.mockResolvedValue([
        { id: "gc1", productId: "prod-1", variantId: null, quantity: 1, createdAt: new Date(), product: mockProduct, variant: null },
      ]);

      const userCart = await service.getCart("user-1");
      const guestCart = await service.getGuestCart("guest-session-1");

      expect(userCart.summary.subtotal).toBe(guestCart.summary.subtotal);
      expect(userCart.summary.deliveryFee).toBe(guestCart.summary.deliveryFee);
      expect(userCart.summary.gstAmount).toBe(guestCart.summary.gstAmount);
      expect(userCart.summary.extraFeeAmount).toBe(guestCart.summary.extraFeeAmount);
      expect(userCart.summary.grandTotal).toBe(guestCart.summary.grandTotal);
    });
  });

  describe("Redis-first cart caching", () => {
    it("should read from Redis cache on getCart when cache is populated", async () => {
      const cachedEntry = JSON.stringify({
        id: "cache-item-1",
        productId: "prod-1",
        variantId: null,
        quantity: 2,
        addedAt: new Date().toISOString(),
      });

      mockRedisService.hgetall.mockResolvedValue({ "prod-1": cachedEntry });

      mockPrismaService.product.findMany.mockResolvedValue([
        {
          id: "prod-1", name: "Cached Product", slug: "cached-product",
          price: 500, discountPrice: 400, imageUrl: null, images: [],
          stock: 10, status: "ACTIVE", deletedAt: null,
          category: { id: "cat-1", name: "Cat", slug: "cat" },
        },
      ]);
      mockPrismaService.productVariant.findMany.mockResolvedValue([]);

      const result = await service.getCart("user-1");

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect((result.items[0] as any).id).toBe("cache-item-1");
      expect((result.items[0] as any).quantity).toBe(2);
      // Should NOT have called cartItem.findMany (DB fallback)
      expect(mockPrismaService.cartItem.findMany).not.toHaveBeenCalled();
    });

    it("should fall through to DB when Redis returns empty hash", async () => {
      mockRedisService.hgetall.mockResolvedValue({});

      const mockProduct = {
        id: "prod-1", name: "DB Product", slug: "db-product",
        price: 300, discountPrice: null, imageUrl: null, images: [],
        stock: 5, category: null,
      };

      mockPrismaService.cartItem.findMany.mockResolvedValue([
        { id: "db-item-1", productId: "prod-1", variantId: null, quantity: 1, createdAt: new Date(), product: mockProduct, variant: null },
      ]);

      const result = await service.getCart("user-1");

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect((result.items[0] as any).id).toBe("db-item-1");
      expect(mockPrismaService.cartItem.findMany).toHaveBeenCalled();
      // Should warm the cache
      expect(mockRedisService.hset).toHaveBeenCalled();
    });

    it("should write to Redis on addCartItem and fall through to DB when Redis fails", async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: "prod-1", status: "ACTIVE", deletedAt: null, type: "SIMPLE", stock: 10,
      });
      mockPrismaService.productVariant.count.mockResolvedValue(0);

      // Redis hget returns null (item doesn't exist)
      mockRedisService.hget.mockResolvedValue(null);
      // Redis hset fails
      mockRedisService.hset.mockResolvedValue(false);

      // DB fallback should be used
      mockPrismaService.cartItem.findFirst.mockResolvedValue(null);
      mockPrismaService.cartItem.create.mockResolvedValue({ id: "new-item" });
      mockRedisService.hgetall.mockResolvedValue({});
      mockPrismaService.cartItem.findMany.mockResolvedValue([]);

      await service.addCartItem("user-1", { productId: "prod-1", quantity: 1 });

      expect(mockPrismaService.cartItem.create).toHaveBeenCalled();
    });
  });
});
