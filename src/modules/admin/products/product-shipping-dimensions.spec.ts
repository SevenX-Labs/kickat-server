import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ProductsService } from "./products.service";
import { ShippingService } from "../shipping/shipping.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";
import { StockAlertService } from "../../notifications/stock-alert.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { NullShippingProvider } from "../shipping/providers/null-shipping.provider";
import { ShiprocketProvider } from "../shipping/providers/shiprocket.provider";
import { CreateProductDto, UpdateProductDto } from "./dto/admin-product.dto";

describe("Mandatory Shipping & Package Dimensions Specification", () => {
  let productsService: ProductsService;
  let shippingService: ShippingService;
  let shiprocketProvider: ShiprocketProvider;
  let prisma: any;
  let uploadService: any;
  let configService: any;

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      productMedia: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: "cat-1", name: "Dog Food" }),
      },
      cartItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      shippingRate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      shippingZone: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    uploadService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
      deleteFilesByUrls: jest.fn().mockResolvedValue(1),
      relocateToNamespace: jest.fn((url) => Promise.resolve(url)),
      relocateMultipleToNamespace: jest.fn((urls) => Promise.resolve(urls || [])),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "SHIPPING_PROVIDER") return "SHIPROCKET";
        if (key === "SHIPROCKET_PICKUP_LOCATION") return "Main Warehouse";
        return defaultValue || "";
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        ShippingService,
        NullShippingProvider,
        { provide: ConfigService, useValue: configService },
        {
          provide: NotificationsService,
          useValue: {
            notifyOrderPlaced: jest.fn(),
            notifyPaymentSuccess: jest.fn(),
            notifyPaymentFailed: jest.fn(),
            notifyOrderStatusChange: jest.fn(),
            notifyReturnStatus: jest.fn(),
            notifyRefundStatus: jest.fn(),
            sendEventNotification: jest.fn(),
          },
        },
        {
          provide: ShiprocketProvider,
          useValue: {
            createShipment: jest.fn().mockResolvedValue({
              providerName: "SHIPROCKET",
              orderId: 99991,
              shipmentId: 88881,
              status: "NEW",
              statusCode: 1,
            }),
            checkServiceability: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: uploadService },
        {
          provide: StockAlertService,
          useValue: {
            notifyAdminLowStock: jest.fn().mockResolvedValue(undefined),
            notifyAdminOutOfStock: jest.fn().mockResolvedValue(undefined),
            notifyAdminVariantLowStock: jest.fn().mockResolvedValue(undefined),
            notifyAdminVariantOutOfStock: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    productsService = module.get<ProductsService>(ProductsService);
    shippingService = module.get<ShippingService>(ShippingService);
    shiprocketProvider = module.get<ShiprocketProvider>(ShiprocketProvider);
  });

  describe("A. Simple Product Shipping Dimensions", () => {
    it("1. Valid shipping data -> PASS", async () => {
      prisma.product.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "prod-1", ...data })
      );

      const dto: CreateProductDto = {
        name: "Simple Dog Food 3kg",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 3.0,
        shippingLengthCm: 35,
        shippingBreadthCm: 25,
        shippingHeightCm: 15,
      };

      const result = await productsService.createProduct(dto);
      expect(result.success).toBe(true);
      expect(prisma.product.create).toHaveBeenCalled();
      const createData = prisma.product.create.mock.calls[0][0].data;
      expect(createData.shippingWeightKg).toBe(3.0);
      expect(createData.shippingLengthCm).toBe(35);
      expect(createData.shippingBreadthCm).toBe(25);
      expect(createData.shippingHeightCm).toBe(15);
    });

    it("2. Missing weight -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingLengthCm: 35,
        shippingBreadthCm: 25,
        shippingHeightCm: 15,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("3. Missing length -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 3.0,
        shippingBreadthCm: 25,
        shippingHeightCm: 15,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("4. Missing breadth -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 3.0,
        shippingLengthCm: 35,
        shippingHeightCm: 15,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("5. Missing height -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 3.0,
        shippingLengthCm: 35,
        shippingBreadthCm: 25,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("6. Zero weight -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 0,
        shippingLengthCm: 35,
        shippingBreadthCm: 25,
        shippingHeightCm: 15,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("7. Negative dimension -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Simple Dog Food",
        price: 999,
        categoryId: "cat-1",
        shippingWeightKg: 3.0,
        shippingLengthCm: -35,
        shippingBreadthCm: 25,
        shippingHeightCm: 15,
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe("B. Variable Product Shipping Dimensions", () => {
    it("8. All variants complete -> PASS", async () => {
      prisma.product.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: "prod-var",
          ...data,
          variants: data.variants.create.map((v: any, idx: number) => ({ id: `var-${idx + 1}`, ...v })),
        })
      );

      const dto: CreateProductDto = {
        name: "Multi-Pack Kibble",
        price: 499,
        categoryId: "cat-1",
        variants: [
          {
            name: "1.2 Kg",
            price: 499,
            stock: 20,
            shippingWeightKg: 1.2,
            shippingLengthCm: 20,
            shippingBreadthCm: 15,
            shippingHeightCm: 10,
          },
          {
            name: "3 Kg",
            price: 1199,
            stock: 15,
            shippingWeightKg: 3.0,
            shippingLengthCm: 35,
            shippingBreadthCm: 25,
            shippingHeightCm: 15,
          },
        ],
      };

      const result = await productsService.createProduct(dto);
      expect(result.success).toBe(true);
      const createdVariants = prisma.product.create.mock.calls[0][0].data.variants.create;
      expect(createdVariants[0].shippingWeightKg).toBe(1.2);
      expect(createdVariants[1].shippingWeightKg).toBe(3.0);
    });

    it("9. One variant missing weight -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Multi-Pack Kibble",
        price: 499,
        categoryId: "cat-1",
        variants: [
          {
            name: "1.2 Kg",
            price: 499,
            stock: 20,
            shippingWeightKg: 1.2,
            shippingLengthCm: 20,
            shippingBreadthCm: 15,
            shippingHeightCm: 10,
          },
          {
            name: "3 Kg",
            price: 1199,
            stock: 15,
            shippingLengthCm: 35,
            shippingBreadthCm: 25,
            shippingHeightCm: 15,
          },
        ],
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("10. One variant missing length -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Multi-Pack Kibble",
        price: 499,
        categoryId: "cat-1",
        variants: [
          {
            name: "1.2 Kg",
            price: 499,
            stock: 20,
            shippingWeightKg: 1.2,
            shippingBreadthCm: 15,
            shippingHeightCm: 10,
          },
          {
            name: "3 Kg",
            price: 1199,
            stock: 15,
            shippingWeightKg: 3.0,
            shippingLengthCm: 35,
            shippingBreadthCm: 25,
            shippingHeightCm: 15,
          },
        ],
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("11. One variant missing breadth -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Multi-Pack Kibble",
        price: 499,
        categoryId: "cat-1",
        variants: [
          {
            name: "1.2 Kg",
            price: 499,
            stock: 20,
            shippingWeightKg: 1.2,
            shippingLengthCm: 20,
            shippingHeightCm: 10,
          },
          {
            name: "3 Kg",
            price: 1199,
            stock: 15,
            shippingWeightKg: 3.0,
            shippingLengthCm: 35,
            shippingBreadthCm: 25,
            shippingHeightCm: 15,
          },
        ],
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("12. One variant missing height -> FAIL", async () => {
      const dto: CreateProductDto = {
        name: "Multi-Pack Kibble",
        price: 499,
        categoryId: "cat-1",
        variants: [
          {
            name: "1.2 Kg",
            price: 499,
            stock: 20,
            shippingWeightKg: 1.2,
            shippingLengthCm: 20,
            shippingBreadthCm: 15,
          },
          {
            name: "3 Kg",
            price: 1199,
            stock: 15,
            shippingWeightKg: 3.0,
            shippingLengthCm: 35,
            shippingBreadthCm: 25,
            shippingHeightCm: 15,
          },
        ],
      };

      await expect(productsService.createProduct(dto)).rejects.toThrow(BadRequestException);
    });

    it("13. Different variants can have different dimensions -> PASS", async () => {
      prisma.product.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "prod-diff-dims", ...data })
      );

      const dto: CreateProductDto = {
        name: "Multi Dog Bed",
        price: 899,
        categoryId: "cat-1",
        variants: [
          {
            name: "Small Bed",
            price: 899,
            stock: 10,
            shippingWeightKg: 1.5,
            shippingLengthCm: 40,
            shippingBreadthCm: 30,
            shippingHeightCm: 10,
          },
          {
            name: "Large Bed",
            price: 1899,
            stock: 5,
            shippingWeightKg: 4.5,
            shippingLengthCm: 90,
            shippingBreadthCm: 60,
            shippingHeightCm: 25,
          },
        ],
      };

      const result = await productsService.createProduct(dto);
      expect(result.success).toBe(true);
      const variantsData = prisma.product.create.mock.calls[0][0].data.variants.create;
      expect(variantsData[0].shippingLengthCm).toBe(40);
      expect(variantsData[1].shippingLengthCm).toBe(90);
      expect(variantsData[0].shippingWeightKg).toBe(1.5);
      expect(variantsData[1].shippingWeightKg).toBe(4.5);
    });
  });

  describe("C. Shiprocket Integration & Shipping Package Resolution", () => {
    it("14. Correct variant shipping data is used -> PASS", async () => {
      const order = {
        id: "order-1",
        orderNumber: "ORD-TEST-14",
        orderStatus: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "RAZORPAY",
        shippingStatus: "PROCESSING",
        address: {
          fullName: "Sahil Test",
          phone: "9876543210",
          houseFlat: "Flat 101",
          buildingStreet: "123 Green Valley Road",
          city: "Thane",
          state: "Maharashtra",
          pincode: "400612",
          country: "India",
        },
        user: { name: "Sahil Test", email: "test@kickat.com", phone: "9876543210" },
        items: [
          {
            id: "item-1",
            productId: "prod-14",
            variantId: "var-14-3kg",
            name: "Adult Dog Food",
            variantName: "3 Kg",
            quantity: 2,
            price: 1199,
          },
        ],
        subtotal: 2398,
        discount: 0,
        shippingCost: 0,
        tax: 0,
        total: 2398,
      };

      prisma.order.findFirst.mockResolvedValue(order);
      prisma.order.update.mockResolvedValue({ ...order, shiprocketOrderId: 99991 });
      prisma.product.findMany.mockResolvedValue([
        {
          id: "prod-14",
          name: "Adult Dog Food",
          variants: [
            {
              id: "var-14-3kg",
              name: "3 Kg",
              shippingWeightKg: 3.0,
              shippingLengthCm: 35,
              shippingBreadthCm: 25,
              shippingHeightCm: 15,
            },
          ],
        },
      ]);

      const res = await shippingService.createShipmentForOrder("order-1");
      expect(res.success).toBe(true);
      expect(shiprocketProvider.createShipment).toHaveBeenCalled();
      const providerCallArg = (shiprocketProvider.createShipment as jest.Mock).mock.calls[0][0];
      expect(providerCallArg.packageDetails.weight).toBe(6.0); // 3.0kg * 2 qty
      expect(providerCallArg.packageDetails.length).toBe(35);
      expect(providerCallArg.packageDetails.breadth).toBe(25);
      expect(providerCallArg.packageDetails.height).toBe(30); // 15cm * 2 qty
    });

    it("15. Missing dimensions prevents Shiprocket API call -> PASS", async () => {
      const order = {
        id: "order-2",
        orderNumber: "ORD-TEST-15",
        orderStatus: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "RAZORPAY",
        shippingStatus: "PROCESSING",
        address: {
          fullName: "Test User",
          phone: "9876543210",
          houseFlat: "101",
          buildingStreet: "123 Road",
          city: "Thane",
          state: "Maharashtra",
          pincode: "400612",
        },
        user: { name: "Test User", email: "test@example.com" },
        items: [
          {
            id: "item-2",
            productId: "prod-incomplete",
            variantId: "var-incomplete",
            name: "Unset Dimensions Product",
            variantName: "Default",
            quantity: 1,
            price: 500,
          },
        ],
        subtotal: 500,
        total: 500,
      };

      prisma.order.findFirst.mockResolvedValue(order);
      prisma.product.findMany.mockResolvedValue([
        {
          id: "prod-incomplete",
          name: "Unset Dimensions Product",
          shippingWeightKg: null,
          shippingLengthCm: null,
          shippingBreadthCm: null,
          shippingHeightCm: null,
          variants: [
            {
              id: "var-incomplete",
              name: "Default",
              shippingWeightKg: null,
              shippingLengthCm: null,
              shippingBreadthCm: null,
              shippingHeightCm: null,
            },
          ],
        },
      ]);

      await expect(shippingService.createShipmentForOrder("order-2")).rejects.toThrow(BadRequestException);
      expect(shiprocketProvider.createShipment).not.toHaveBeenCalled();
    });

    it("16. No fake fallback dimensions -> PASS", async () => {
      const order = {
        id: "order-3",
        orderNumber: "ORD-TEST-16",
        orderStatus: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "RAZORPAY",
        shippingStatus: "PROCESSING",
        address: {
          fullName: "Test User",
          phone: "9876543210",
          addressLine1: "123 Road",
          city: "Thane",
          state: "Maharashtra",
          pincode: "400612",
        },
        user: { name: "Test User", email: "test@example.com" },
        items: [
          {
            id: "item-3",
            productId: "prod-partial",
            name: "Only Weight Product",
            quantity: 1,
            price: 500,
          },
        ],
        subtotal: 500,
        total: 500,
      };

      prisma.order.findFirst.mockResolvedValue(order);
      // Only weight is set, dimensions are missing
      prisma.product.findMany.mockResolvedValue([
        {
          id: "prod-partial",
          name: "Only Weight Product",
          shippingWeightKg: 2.0,
          shippingLengthCm: null,
          shippingBreadthCm: null,
          shippingHeightCm: null,
          variants: [],
        },
      ]);

      await expect(shippingService.createShipmentForOrder("order-3")).rejects.toThrow(BadRequestException);
      expect(shiprocketProvider.createShipment).not.toHaveBeenCalled();
    });
  });

  describe("D. Existing Product Compatibility", () => {
    it("17. Existing product can still be read -> PASS", async () => {
      const existingProduct = {
        id: "prod-legacy-1",
        name: "Legacy Product",
        slug: "legacy-product",
        shippingWeightKg: null,
        shippingLengthCm: null,
        shippingBreadthCm: null,
        shippingHeightCm: null,
        variants: [
          {
            id: "var-legacy-1",
            name: "Legacy Var",
            shippingWeightKg: null,
            shippingLengthCm: null,
            shippingBreadthCm: null,
            shippingHeightCm: null,
          },
        ],
        media: [],
        category: { id: "cat-1", name: "Food" },
      };

      prisma.product.findFirst.mockResolvedValue(existingProduct);
      prisma.product.findUnique.mockResolvedValue(existingProduct);

      const result = await productsService.getProductById("prod-legacy-1");
      expect(result.success).toBe(true);
      expect(result.data.shippingWeightKg).toBeNull();
      expect(result.data.shippingLengthCm).toBeNull();
      expect(result.data.shippingBreadthCm).toBeNull();
      expect(result.data.shippingHeightCm).toBeNull();
    });

    it("18. Existing incomplete product can be edited -> PASS", async () => {
      const existingProduct = {
        id: "prod-legacy-edit",
        name: "Legacy Product To Edit",
        slug: "legacy-edit",
        type: "SIMPLE",
        price: 500,
        shippingWeightKg: null,
        shippingLengthCm: null,
        shippingBreadthCm: null,
        shippingHeightCm: null,
        variants: [],
        media: [],
      };

      prisma.product.findFirst.mockResolvedValue(existingProduct);
      prisma.product.findUnique.mockResolvedValue(null); // slug is unique
      prisma.product.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "prod-legacy-edit", ...data })
      );

      const updateDto: UpdateProductDto = {
        shippingWeightKg: 2.5,
        shippingLengthCm: 30,
        shippingBreadthCm: 20,
        shippingHeightCm: 10,
      };

      const result = await productsService.updateProduct("prod-legacy-edit", updateDto);
      expect(result.success).toBe(true);
      expect(prisma.product.update).toHaveBeenCalled();
      const updateData = prisma.product.update.mock.calls[0][0].data;
      expect(updateData.shippingWeightKg).toBe(2.5);
      expect(updateData.shippingLengthCm).toBe(30);
      expect(updateData.shippingBreadthCm).toBe(20);
      expect(updateData.shippingHeightCm).toBe(10);
    });
  });
});
