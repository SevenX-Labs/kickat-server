import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService, OtpCacheService } from '../../common';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    otpLog: { count: jest.fn(), create: jest.fn(), aggregate: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    product: { findFirst: jest.fn() },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockEmailService = {
    sendOtpEmail: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        OtpCacheService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
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

    // Mock 1 excess entry after skip: 20
    mockPrismaService.recentlyViewed.findMany.mockResolvedValue([{ id: 'rv_21' }]);

    await service.addRecentlyViewed('user1', 'p21');

    expect(mockPrismaService.recentlyViewed.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['rv_21'] } },
    });
  });
});
