import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HomeService', () => {
  let service: HomeService;

  const mockPrismaService = {
    banner: { findMany: jest.fn() },
    category: { findMany: jest.fn(), findUnique: jest.fn() },
    product: { findMany: jest.fn(), count: jest.fn() },
    pet: { findUnique: jest.fn(), findFirst: jest.fn() },
    blogPost: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
