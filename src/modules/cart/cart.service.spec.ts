import { Test, TestingModule } from "@nestjs/testing";
import { CartService, calculateFeesHelper } from "./cart.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../admin/settings/settings.service";

describe("CartService & Fee Calculation Engine", () => {
  let service: CartService;

  const mockPrismaService = {
    cartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
    },
    guestCartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
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
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("calculateFeesHelper GST Precision & Rounding Edge Cases", () => {
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
        price: 400,
        discountPrice: 350,
        stock: 10,
        imageUrl: "http://example.com/img.jpg",
      };

      mockPrismaService.cartItem.findMany.mockResolvedValue([
        { id: "c1", productId: "prod-1", variantId: null, quantity: 1, product: mockProduct, variant: null },
      ]);

      mockPrismaService.guestCartItem.findMany.mockResolvedValue([
        { id: "gc1", productId: "prod-1", variantId: null, quantity: 1, product: mockProduct, variant: null },
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
});
