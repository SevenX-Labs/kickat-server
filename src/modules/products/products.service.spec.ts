import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    productVariant: {
      findMany: jest.fn(),
    },
    productMedia: {
      findMany: jest.fn(),
    },
    productReview: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should query by UUID when parameter is valid UUID v4', async () => {
    const uuid = '22222222-2222-4222-8222-222222222222';
    mockPrismaService.product.findFirst.mockResolvedValue({ id: uuid, name: 'Dog Kibble' });

    const res = await service.getProductByIdOrSlug(uuid);
    expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith({
      where: { id: uuid, deletedAt: null },
      include: expect.any(Object),
    });
    expect(res.product.id).toBe(uuid);
  });

  it('should query by SEO slug when parameter is not a UUID', async () => {
    const slug = 'dog-food-kibble-10kg';
    mockPrismaService.product.findFirst.mockResolvedValue({ id: 'p1', slug, name: 'Dog Kibble' });

    const res = await service.getProductByIdOrSlug(slug);
    expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith({
      where: { slug, deletedAt: null },
      include: expect.any(Object),
    });
    expect(res.product.slug).toBe(slug);
  });

  it('should throw NotFoundException when product is not found', async () => {
    mockPrismaService.product.findFirst.mockResolvedValue(null);
    await expect(service.getProductByIdOrSlug('non-existent-slug')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return descriptionTitle in public product details', async () => {
    const slug = 'rubber-bone-toy';
    mockPrismaService.product.findFirst.mockResolvedValue({
      id: 'p1',
      slug,
      name: 'Rubber Bone Toy',
      descriptionTitle: 'Why Your Pet Will Love It',
      description: 'Durable rubber chew toy',
    });

    const res = await service.getProductByIdOrSlug(slug);
    expect(res.product.descriptionTitle).toBe('Why Your Pet Will Love It');
    expect(res.product.description).toBe('Durable rubber chew toy');
  });

  it('should work seamlessly for legacy products without descriptionTitle (returns null)', async () => {
    const slug = 'legacy-dog-food';
    mockPrismaService.product.findFirst.mockResolvedValue({
      id: 'p2',
      slug,
      name: 'Legacy Dog Food',
      descriptionTitle: null,
      description: 'Healthy dog food',
    });

    const res = await service.getProductByIdOrSlug(slug);
    expect(res.product.descriptionTitle).toBeNull();
    expect(res.product.name).toBe('Legacy Dog Food');
  });
});
