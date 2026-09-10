import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';

describe('CartService', () => {
  let service: CartService;

  const mockPrismaService = {
    cartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
    },
    guestCartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockSettingsService = {
    getDeliverySettingsRaw: jest.fn().mockResolvedValue({
      deliveryFeeEnabled: true,
      deliveryFee: 49,
      freeDeliveryThreshold: 500,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
