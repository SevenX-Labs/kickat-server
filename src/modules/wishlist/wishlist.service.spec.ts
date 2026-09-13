import { Test, TestingModule } from "@nestjs/testing";
import { WishlistService } from "./wishlist.service";
import { PrismaService } from "../../prisma/prisma.service";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

describe("WishlistService", () => {
  let service: WishlistService;

  const mockPrismaService = {
    wishlistItem: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    cartItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<WishlistService>(WishlistService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("addToWishlist", () => {
    it("1. Add simple product to wishlist successfully", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p1", type: "SIMPLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue(null);
      mockPrismaService.wishlistItem.create.mockResolvedValue({ id: "w1", userId: "u1", productId: "p1", variantId: null });

      const res = await service.addToWishlist("u1", { productId: "p1" });
      expect(res.success).toBe(true);
      expect(mockPrismaService.wishlistItem.create).toHaveBeenCalledWith({
        data: { userId: "u1", productId: "p1", variantId: null },
        include: { product: true, variant: true },
      });
    });

    it("2. Add same simple product twice => duplicate prevented", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p1", type: "SIMPLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue({ id: "w1", userId: "u1", productId: "p1", variantId: null });

      await expect(service.addToWishlist("u1", { productId: "p1" })).rejects.toThrow(ConflictException);
    });

    it("3. Add variable product variant A => succeeds", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p2", type: "VARIABLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.productVariant.findFirst.mockResolvedValue({ id: "varA", productId: "p2" });
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue(null);
      mockPrismaService.wishlistItem.create.mockResolvedValue({ id: "w2", userId: "u1", productId: "p2", variantId: "varA" });

      const res = await service.addToWishlist("u1", { productId: "p2", variantId: "varA" });
      expect(res.success).toBe(true);
      expect(mockPrismaService.wishlistItem.create).toHaveBeenCalledWith({
        data: { userId: "u1", productId: "p2", variantId: "varA" },
        include: { product: true, variant: true },
      });
    });

    it("4. Add same variable product variant A again => duplicate prevented", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p2", type: "VARIABLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.productVariant.findFirst.mockResolvedValue({ id: "varA", productId: "p2" });
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue({ id: "w2", userId: "u1", productId: "p2", variantId: "varA" });

      await expect(service.addToWishlist("u1", { productId: "p2", variantId: "varA" })).rejects.toThrow(ConflictException);
    });

    it("5 & 6. Add same variable product variant B => succeeds alongside variant A", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p2", type: "VARIABLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.productVariant.findFirst.mockResolvedValue({ id: "varB", productId: "p2" });
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue(null);
      mockPrismaService.wishlistItem.create.mockResolvedValue({ id: "w3", userId: "u1", productId: "p2", variantId: "varB" });

      const res = await service.addToWishlist("u1", { productId: "p2", variantId: "varB" });
      expect(res.success).toBe(true);
    });

    it("7. Add variable product without variantId => rejected", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p2", type: "VARIABLE", status: "ACTIVE", deletedAt: null });

      await expect(service.addToWishlist("u1", { productId: "p2" })).rejects.toThrow(BadRequestException);
    });

    it("8. Add variant belonging to another product => rejected", async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({ id: "p2", type: "VARIABLE", status: "ACTIVE", deletedAt: null });
      mockPrismaService.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.addToWishlist("u1", { productId: "p2", variantId: "varOther" })).rejects.toThrow(BadRequestException);
    });
  });

  describe("removeFromWishlist", () => {
    it("9. Remove variant A without removing variant B", async () => {
      mockPrismaService.wishlistItem.findFirst.mockResolvedValue({ id: "w2", userId: "u1", productId: "p2", variantId: "varA" });
      mockPrismaService.wishlistItem.delete.mockResolvedValue({});

      const res = await service.removeFromWishlist("u1", "p2", "varA");
      expect(res.success).toBe(true);
      expect(mockPrismaService.wishlistItem.findFirst).toHaveBeenCalledWith({
        where: { userId: "u1", productId: "p2", variantId: "varA" },
      });
      expect(mockPrismaService.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: "w2" } });
    });
  });
});
