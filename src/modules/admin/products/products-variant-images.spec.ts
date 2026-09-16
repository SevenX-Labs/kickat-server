import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "./products.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";
import { StockAlertService } from "../../notifications/stock-alert.service";
import { BadRequestException } from "@nestjs/common";
import { ProductStatusEnum, ProductType } from "@prisma/client";

describe("Product Variant Image Isolation & Normalization", () => {
  let service: ProductsService;
  let prisma: any;
  let uploadService: any;
  
  const createMockPrismaService = () => {
    const mockPrisma: any = {
    category: {
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    productMedia: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    cartItem: {
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    return mockPrisma;
  };

  const createMockUploadService = () => ({

    relocateMultipleToNamespace: jest.fn(),
    relocateToNamespace: jest.fn(),
    deleteFilesByUrls: jest.fn(),
  });

  const mockStockAlertService = {
    evaluateStockChange: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrismaService();
    uploadService = createMockUploadService();

    service = new ProductsService(
      prisma as any,
      uploadService as any,
      mockStockAlertService as any,
    );

    prisma.category.findUnique.mockResolvedValue({ id: "cat-1", name: "Cat Category" });
    uploadService.relocateMultipleToNamespace.mockImplementation(async (urls: string[]) => urls);
    uploadService.relocateToNamespace.mockImplementation(async (url: string) => url);
    prisma.productMedia.findFirst.mockResolvedValue(null);
    prisma.productVariant.findFirst.mockResolvedValue(null);
    prisma.product.findFirst.mockResolvedValue(null);
  });

  

  it("1. Create SIMPLE product with product gallery", async () => {
    prisma.product.create.mockImplementation((args: any) =>
      Promise.resolve({ id: "prod-simple", ...args.data }),
    );

    const res = await service.createProduct({
      name: "Simple Chew Toy",
      price: 199,
      categoryId: "cat-1",
      type: ProductType.SIMPLE,
      images: ["/uploads/prod-gal-1.jpg", "/uploads/prod-gal-2.jpg"],
    });

    expect(res.success).toBe(true);
    expect(prisma.product.create).toHaveBeenCalled();
    const callData = prisma.product.create.mock.calls[0][0].data;
    expect(callData.images).toEqual(["/uploads/prod-gal-1.jpg", "/uploads/prod-gal-2.jpg"]);
    expect(callData.imageUrl).toBe("/uploads/prod-gal-1.jpg");
    expect(callData.variants).toBeUndefined();
  });

  it("2 & 3 & 4. Create VARIABLE product with separate variant images and verify product gallery is not copied to variants", async () => {
    prisma.product.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: "prod-var",
        ...args.data,
        variants: args.data.variants.create.map((v: any, idx: number) => ({ id: `v-${idx + 1}`, ...v })),
      }),
    );

    const res = await service.createProduct({
      name: "Dog Harness",
      price: 499,
      categoryId: "cat-1",
      images: ["/uploads/main-gallery-1.jpg", "/uploads/main-gallery-2.jpg"],
      variants: [
        {
          name: "Red Harness",
          price: 499,
          stock: 10,
          images: ["/uploads/red-1.jpg", "/uploads/red-2.jpg"],
        },
        {
          name: "Blue Harness",
          price: 599,
          stock: 15,
          images: ["/uploads/blue-1.jpg", "/uploads/blue-2.jpg"],
        },
      ],
    });

    expect(res.success).toBe(true);
    const callData = prisma.product.create.mock.calls[0][0].data;
    const createdVars = callData.variants.create;

    // Variant 1 images independent
    expect(createdVars[0].images).toEqual(["/uploads/red-1.jpg", "/uploads/red-2.jpg"]);
    expect(createdVars[0].imageUrl).toBe("/uploads/red-1.jpg");

    // Variant 2 images independent
    expect(createdVars[1].images).toEqual(["/uploads/blue-1.jpg", "/uploads/blue-2.jpg"]);
    expect(createdVars[1].imageUrl).toBe("/uploads/blue-1.jpg");

    // Product gallery remains main-gallery-1, main-gallery-2
    expect(callData.images).toEqual(["/uploads/main-gallery-1.jpg", "/uploads/main-gallery-2.jpg"]);
  });

  it("5 & 6. Update VARIABLE product with different images for each variant and preserve separate images", async () => {
    prisma.product.findFirst.mockImplementation((args) => {
      if (args?.where?.id === "prod-var-1") {
        return Promise.resolve({
          id: "prod-var-1",
          name: "Harness",
          slug: "harness",
          type: "VARIABLE",
          price: 500,
          discountPrice: null,
          stock: 25,
          variants: [
            { id: "var-1", name: "Red", price: 500, stock: 10, images: ["/uploads/red-1.jpg"], imageUrl: "/uploads/red-1.jpg" },
            { id: "var-2", name: "Blue", price: 500, stock: 15, images: ["/uploads/blue-1.jpg"], imageUrl: "/uploads/blue-1.jpg" },
          ],
          media: [],
        });
      }
      return Promise.resolve(null);
    });

    prisma.productVariant.findUnique.mockResolvedValue({ stock: 10 });
    prisma.productVariant.findMany.mockResolvedValue([{ stock: 10 }, { stock: 15 }]);
    prisma.productVariant.update.mockResolvedValue({});
    prisma.product.update.mockResolvedValue({ id: "prod-var-1" });
    prisma.product.findUnique.mockResolvedValue({
      id: "prod-var-1",
      variants: [
        { id: "var-1", name: "Red", price: 500, stock: 10, images: ["/uploads/red-updated-1.jpg", "/uploads/red-updated-2.jpg"], imageUrl: "/uploads/red-updated-1.jpg" },
        { id: "var-2", name: "Blue", price: 500, stock: 15, images: ["/uploads/blue-updated-1.jpg"], imageUrl: "/uploads/blue-updated-1.jpg" },
      ],
    });

    await service.updateProduct("prod-var-1", {
      variants: [
        {
          id: "var-1",
          name: "Red",
          price: 500,
          stock: 10,
          images: ["/uploads/red-updated-1.jpg", "/uploads/red-updated-2.jpg"],
        },
        {
          id: "var-2",
          name: "Blue",
          price: 500,
          stock: 15,
          images: ["/uploads/blue-updated-1.jpg"],
        },
      ],
    });

    expect(prisma.productVariant.update).toHaveBeenCalledTimes(2);
    const v1UpdateCall = prisma.productVariant.update.mock.calls[0][0];
    expect(v1UpdateCall.data.images).toEqual(["/uploads/red-updated-1.jpg", "/uploads/red-updated-2.jpg"]);
    expect(v1UpdateCall.data.imageUrl).toBe("/uploads/red-updated-1.jpg");

    const v2UpdateCall = prisma.productVariant.update.mock.calls[1][0];
    expect(v2UpdateCall.data.images).toEqual(["/uploads/blue-updated-1.jpg"]);
    expect(v2UpdateCall.data.imageUrl).toBe("/uploads/blue-updated-1.jpg");
  });

  it("7 & 8 & 9. Normalization: imageUrl equals first image, imageUrl-only creates images[], images[]-only creates imageUrl", async () => {
    prisma.product.create.mockImplementation((args: any) =>
      Promise.resolve({ id: "prod-norm", ...args.data }),
    );

    await service.createProduct({
      name: "Norm Product",
      price: 100,
      categoryId: "cat-1",
      variants: [
        { name: "Var A", price: 100, imageUrl: "/uploads/url-only.jpg" },
        { name: "Var B", price: 100, images: ["/uploads/arr-1.jpg", "/uploads/arr-2.jpg"] },
        { name: "Var C", price: 100, imageUrl: "/uploads/url-c.jpg", images: ["/uploads/c-1.jpg", "/uploads/c-2.jpg"] },
      ],
    });

    const createdVars = prisma.product.create.mock.calls[0][0].data.variants.create;
    expect(createdVars[0].images).toEqual(["/uploads/url-only.jpg"]);
    expect(createdVars[0].imageUrl).toBe("/uploads/url-only.jpg");

    expect(createdVars[1].images).toEqual(["/uploads/arr-1.jpg", "/uploads/arr-2.jpg"]);
    expect(createdVars[1].imageUrl).toBe("/uploads/arr-1.jpg");

    expect(createdVars[2].images).toEqual(["/uploads/c-1.jpg", "/uploads/c-2.jpg"]);
    expect(createdVars[2].imageUrl).toBe("/uploads/c-1.jpg");
  });

  it("10. Reject more than 5 images per variant", async () => {
    await expect(
      service.createProduct({
        name: "Max Images Prod",
        price: 100,
        categoryId: "cat-1",
        variants: [
          {
            name: "Var 1",
            price: 100,
            images: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("11 & 12. Variant image ownership validation prevents referencing images from another product", async () => {
    prisma.productMedia.findFirst.mockResolvedValue({ id: "med-other", productId: "other-prod" });
    await expect(
      service.createProduct({
        name: "Stolen Image Product",
        price: 100,
        categoryId: "cat-1",
        variants: [
          { name: "Var 1", price: 100, images: ["/uploads/stolen.jpg"] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("13 & 14. Removing one variant does not delete remaining variant images or corrupt product gallery", async () => {
    prisma.product.findFirst.mockImplementation((args) => {
      if (args?.where?.id === "prod-remove-v") {
        return Promise.resolve({
          id: "prod-remove-v",
          name: "Harness",
          slug: "harness",
          type: "VARIABLE",
          price: 500,
          discountPrice: null,
          images: ["/uploads/gal-1.jpg"],
          variants: [
            { id: "var-keep", name: "Keep", price: 500, stock: 10, images: ["/uploads/shared.jpg"], imageUrl: "/uploads/shared.jpg" },
            { id: "var-remove", name: "Remove", price: 500, stock: 5, images: ["/uploads/shared.jpg"], imageUrl: "/uploads/shared.jpg" },
          ],
          media: [],
        });
      }
      return Promise.resolve(null);
    });

    prisma.productVariant.deleteMany.mockResolvedValue({ count: 1 });
    prisma.productVariant.findMany.mockResolvedValue([{ stock: 10 }]);
    prisma.productVariant.findUnique.mockResolvedValue({ stock: 10 });
    prisma.productVariant.update.mockResolvedValue({});
    prisma.product.update.mockResolvedValue({ id: "prod-remove-v" });
    prisma.product.findUnique.mockResolvedValue({ id: "prod-remove-v" });

    await service.updateProduct("prod-remove-v", {
      images: ["/uploads/gal-1.jpg"],
      variants: [
        { id: "var-keep", name: "Keep", price: 500, stock: 10, images: ["/uploads/shared.jpg"] },
      ],
    });

    expect(uploadService.deleteFilesByUrls).not.toHaveBeenCalledWith(expect.arrayContaining(["/uploads/shared.jpg"]));
  });

  it("15 & 16. Returned API data contains correct variant image arrays without duplicate merging", async () => {
    prisma.product.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: "prod-api-resp",
        name: "Response Prod",
        variants: [
          { id: "v1", name: "V1", imageUrl: "/u/v1.jpg", images: ["/u/v1.jpg"] },
          { id: "v2", name: "V2", imageUrl: "/u/v2.jpg", images: ["/u/v2.jpg"] },
        ],
      }),
    );

    const res = await service.createProduct({
      name: "Response Prod",
      price: 100,
      categoryId: "cat-1",
      variants: [
        { name: "V1", price: 100, images: ["/u/v1.jpg"] },
        { name: "V2", price: 100, images: ["/u/v2.jpg"] },
      ],
    });

    expect(res.data.variants[0].images).toEqual(["/u/v1.jpg"]);
    expect(res.data.variants[1].images).toEqual(["/u/v2.jpg"]);
    expect(res.data.variants[0].images).not.toEqual(res.data.variants[1].images);
  });
});
