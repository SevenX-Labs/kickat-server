import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

describe('SearchService', () => {
  let service: SearchService;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    recentSearch: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delByPattern: jest.fn(), setNX: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(true), incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), zincrby: jest.fn().mockResolvedValue('1'), zrevrange: jest.fn().mockResolvedValue([]), ping: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
