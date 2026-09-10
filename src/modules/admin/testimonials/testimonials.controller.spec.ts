import { Test, TestingModule } from "@nestjs/testing";
import { TestimonialsController } from "./testimonials.controller";
import { TestimonialsService } from "./testimonials.service";

describe("Admin TestimonialsController", () => {
  let controller: TestimonialsController;
  let service: TestimonialsService;

  const mockService = {
    create: jest.fn().mockResolvedValue({ success: true, data: { id: "test-id" } }),
    findAll: jest.fn().mockResolvedValue({ success: true, data: { testimonials: [] } }),
    findOne: jest.fn().mockResolvedValue({ success: true, data: { id: "test-id" } }),
    update: jest.fn().mockResolvedValue({ success: true, data: { id: "test-id" } }),
    remove: jest.fn().mockResolvedValue({ success: true, message: "Deleted" }),
    toggleStatus: jest.fn().mockResolvedValue({ success: true, data: { isActive: true } }),
    reorder: jest.fn().mockResolvedValue({ success: true, message: "Reordered" }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestimonialsController],
      providers: [
        { provide: TestimonialsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<TestimonialsController>(TestimonialsController);
    service = module.get<TestimonialsService>(TestimonialsService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should create testimonial", async () => {
    const res = await controller.create({
      name: "Rohan V.",
      content: "Great pet food variety and super fast shipping!",
    });
    expect(res.success).toBe(true);
    expect(mockService.create).toHaveBeenCalled();
  });

  it("should list testimonials", async () => {
    const res = await controller.findAll({});
    expect(res.success).toBe(true);
    expect(mockService.findAll).toHaveBeenCalled();
  });

  it("should get testimonial by id", async () => {
    const res = await controller.findOne("test-id");
    expect(res.success).toBe(true);
    expect(mockService.findOne).toHaveBeenCalledWith("test-id");
  });

  it("should update testimonial", async () => {
    const res = await controller.update("test-id", { name: "Updated Name" });
    expect(res.success).toBe(true);
    expect(mockService.update).toHaveBeenCalledWith("test-id", { name: "Updated Name" });
  });

  it("should toggle status", async () => {
    const res = await controller.toggleStatus("test-id", { isActive: true });
    expect(res.success).toBe(true);
    expect(mockService.toggleStatus).toHaveBeenCalledWith("test-id", { isActive: true });
  });

  it("should reorder testimonials", async () => {
    const res = await controller.reorder({ items: [{ id: "test-id", order: 1 }] });
    expect(res.success).toBe(true);
    expect(mockService.reorder).toHaveBeenCalled();
  });

  it("should remove testimonial", async () => {
    const res = await controller.remove("test-id", "false");
    expect(res.success).toBe(true);
    expect(mockService.remove).toHaveBeenCalledWith("test-id", false);
  });
});
