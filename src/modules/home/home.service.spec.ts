import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

describe('HomeService', () => {
  let service: HomeService;

  const mockPrismaService = {
    banner: { findMany: jest.fn() },
    category: { findMany: jest.fn(), findUnique: jest.fn() },
    product: { findMany: jest.fn(), count: jest.fn() },
    pet: { findUnique: jest.fn(), findFirst: jest.fn() },
    blogPost: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    testimonial: { findMany: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delByPattern: jest.fn(), setNX: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(true), incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), zincrby: jest.fn().mockResolvedValue('1'), zrevrange: jest.fn().mockResolvedValue([]), ping: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
