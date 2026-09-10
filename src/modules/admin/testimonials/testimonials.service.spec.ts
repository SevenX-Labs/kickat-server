import { Test, TestingModule } from "@nestjs/testing";
import { TestimonialsService } from "./testimonials.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotFoundException, BadRequestException } from "@nestjs/common";

describe("Admin TestimonialsService", () => {
  let service: TestimonialsService;
  let prisma: any;

  const mockTestimonial = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    name: "Dr. Ananya Sharma",
    role: "Veterinarian & Pet Parent",
    avatarUrl: "https://res.cloudinary.com/demo/avatar1.jpg",
    rating: 5,
    content: "KickAt products have consistently met high veterinary standards for nutrition.",
    petName: "Leo",
    petType: "Golden Retriever",
    imageUrl: "https://res.cloudinary.com/demo/leo.jpg",
    isActive: true,
    isFeatured: true,
    order: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      testimonial: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestimonialsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TestimonialsService>(TestimonialsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("should create a new testimonial with auto-calculated order if order is 0", async () => {
      prisma.testimonial.aggregate.mockResolvedValue({ _max: { order: 3 } });
      prisma.testimonial.create.mockResolvedValue({
        ...mockTestimonial,
        order: 4,
      });

      const res = await service.create({
        name: "Dr. Ananya Sharma",
        content: "KickAt products have consistently met high veterinary standards for nutrition.",
        rating: 5,
      });

      expect(res.success).toBe(true);
      expect(res.data.name).toBe("Dr. Ananya Sharma");
      expect(prisma.testimonial.create).toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated testimonials with KPI counters", async () => {
      prisma.testimonial.findMany.mockResolvedValue([mockTestimonial]);
      prisma.testimonial.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // activeCount
        .mockResolvedValueOnce(1); // featuredCount
      prisma.testimonial.aggregate.mockResolvedValue({
        _avg: { rating: 5.0 },
      });

      const res = await service.findAll({
        page: 1,
        limit: 10,
        search: "Leo",
      });

      expect(res.success).toBe(true);
      expect(res.data.testimonials).toHaveLength(1);
      expect(res.data.summary.totalTestimonials).toBe(1);
      expect(res.data.summary.activeCount).toBe(1);
      expect(res.data.summary.avgRating).toBe(5.0);
    });
  });

  describe("findOne", () => {
    it("should return a testimonial by UUID", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(mockTestimonial);

      const res = await service.findOne(mockTestimonial.id);
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(mockTestimonial.id);
    });

    it("should throw NotFoundException if testimonial does not exist", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(null);

      await expect(service.findOne(mockTestimonial.id)).rejects.toThrow(
        NotFoundException
      );
    });

    it("should throw BadRequestException if id is not valid UUID", async () => {
      await expect(service.findOne("invalid-id")).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("update", () => {
    it("should edit testimonial fields", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(mockTestimonial);
      prisma.testimonial.update.mockResolvedValue({
        ...mockTestimonial,
        name: "Dr. Ananya S.",
      });

      const res = await service.update(mockTestimonial.id, {
        name: "Dr. Ananya S.",
      });

      expect(res.success).toBe(true);
      expect(res.data.name).toBe("Dr. Ananya S.");
    });
  });

  describe("remove", () => {
    it("should soft delete testimonial by default", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(mockTestimonial);
      prisma.testimonial.update.mockResolvedValue({
        ...mockTestimonial,
        deletedAt: new Date(),
        isActive: false,
      });

      const res = await service.remove(mockTestimonial.id, false);
      expect(res.success).toBe(true);
      expect(prisma.testimonial.update).toHaveBeenCalled();
    });

    it("should permanently delete when permanent flag is true", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(mockTestimonial);
      prisma.testimonial.delete.mockResolvedValue(mockTestimonial);

      const res = await service.remove(mockTestimonial.id, true);
      expect(res.success).toBe(true);
      expect(prisma.testimonial.delete).toHaveBeenCalledWith({
        where: { id: mockTestimonial.id },
      });
    });
  });

  describe("toggleStatus", () => {
    it("should toggle isActive state", async () => {
      prisma.testimonial.findFirst.mockResolvedValue(mockTestimonial);
      prisma.testimonial.update.mockResolvedValue({
        ...mockTestimonial,
        isActive: false,
      });

      const res = await service.toggleStatus(mockTestimonial.id, {
        isActive: false,
      });

      expect(res.success).toBe(true);
      expect(res.data.isActive).toBe(false);
    });
  });

  describe("reorder", () => {
    it("should batch update display orders in transaction", async () => {
      prisma.testimonial.update.mockResolvedValue(mockTestimonial);

      const res = await service.reorder({
        items: [
          { id: mockTestimonial.id, order: 10 },
        ],
      });

      expect(res.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
