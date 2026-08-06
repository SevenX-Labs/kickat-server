import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    product: { findFirst: jest.fn() },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should upsert recently viewed product and update timestamp on duplicate', async () => {
    mockPrismaService.product.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrismaService.recentlyViewed.upsert.mockResolvedValue({ id: 'rv1' });
    mockPrismaService.recentlyViewed.findMany.mockResolvedValue([{ id: 'rv1' }]);

    const res = await service.addRecentlyViewed('user1', 'p1');
    expect(mockPrismaService.recentlyViewed.upsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 'user1', productId: 'p1' } },
      create: { userId: 'user1', productId: 'p1' },
      update: { createdAt: expect.any(Date) },
    });
    expect(res.success).toBe(true);
  });

  it('should trim oldest recently viewed items when count exceeds 20', async () => {
    mockPrismaService.product.findFirst.mockResolvedValue({ id: 'p21' });
    mockPrismaService.recentlyViewed.upsert.mockResolvedValue({ id: 'rv21' });

    // Mock 21 entries
    const mock21Entries = Array.from({ length: 21 }, (_, i) => ({ id: `rv_${i + 1}` }));
    mockPrismaService.recentlyViewed.findMany.mockResolvedValue(mock21Entries);

    await service.addRecentlyViewed('user1', 'p21');

    expect(mockPrismaService.recentlyViewed.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['rv_21'] } },
    });
  });
});
