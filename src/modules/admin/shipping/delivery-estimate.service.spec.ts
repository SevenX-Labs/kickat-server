import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeliveryEstimateService } from './delivery-estimate.service';
import { EkartProvider } from './providers/ekart.provider';
import { ShippingService } from './shipping.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('DeliveryEstimateService', () => {
  let service: DeliveryEstimateService;
  let prismaService: any;
  let configService: any;

  const mockCheckServiceability = jest.fn();
  const mockGetPickupLocationPincode = jest.fn();

  const ekartProvider: Partial<EkartProvider> = {
    providerName: 'EKART' as any,
    checkServiceability: mockCheckServiceability as any,
    getPickupLocationPincode: mockGetPickupLocationPincode as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGetPickupLocationPincode.mockResolvedValue('721643');

    prismaService = {
      productVariant: {
        findUnique: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
      },
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'EKART_PICKUP_ALIAS') return 'Main Warehouse';
        if (key === 'EKART_PICKUP_PINCODE') return '721643';
        if (key === 'EKART_DEFAULT_SERVICE') return 'SURFACE';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryEstimateService,
        { provide: EkartProvider, useValue: ekartProvider },
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useFactory: () => {
          const store = new Map<string, any>();
          return {
            get: jest.fn(async (key: string) => store.has(key) ? store.get(key) : null),
            set: jest.fn(async (key: string, value: any) => { store.set(key, value); }),
            del: jest.fn(async (key: string | string[]) => { const keys = Array.isArray(key) ? key : [key]; keys.forEach(k => store.delete(k)); }),
            delByPattern: jest.fn(),
            setNX: jest.fn().mockResolvedValue(true),
            releaseLock: jest.fn().mockResolvedValue(true),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn(),
            zincrby: jest.fn().mockResolvedValue('1'),
            zrevrange: jest.fn().mockResolvedValue([]),
            ping: jest.fn().mockResolvedValue(true),
          };
        } },
      ],
    }).compile();

    service = module.get<DeliveryEstimateService>(DeliveryEstimateService);
  });

  describe('Pincode Validation', () => {
    it('should reject invalid pincodes (less than 6 digits)', async () => {
      const res = await service.getEstimate({ pincode: '40061' });
      expect(res.available).toBe(false);
      expect(res.message).toBe('Enter a valid 6-digit pincode.');
      expect(mockCheckServiceability).not.toHaveBeenCalled();
    });

    it('should reject invalid pincodes (non-numeric)', async () => {
      const res = await service.getEstimate({ pincode: '40061a' });
      expect(res.available).toBe(false);
      expect(res.message).toBe('Enter a valid 6-digit pincode.');
    });

    it('should reject invalid pincodes (starting with 0)', async () => {
      const res = await service.getEstimate({ pincode: '012345' });
      expect(res.available).toBe(false);
      expect(res.message).toBe('Enter a valid 6-digit pincode.');
    });
  });

  describe('Ekart Provider Serviceability & ETA Parsing', () => {
    it('should return valid ETA for serviceable pincode', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        name: '1.2 Kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockResolvedValue({
        isServiceable: true,
        estimatedDeliveryDate: '2026-10-07',
        estimatedDeliveryDays: 7,
        courierGroup: 'Ekart SURFACE',
      });

      const result = await service.getEstimate({
        pincode: '400612',
        variantId: 'var-1.2kg',
      });

      expect(mockCheckServiceability).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupPostcode: '721643',
          deliveryPostcode: '400612',
          weight: 1.2,
          cod: true,
        }),
      );

      expect(result.available).toBe(true);
      expect(result.pincode).toBe('400612');
      expect(result.courierName).toBe('Ekart SURFACE');
      expect(result.estimatedDeliveryDate).toBe('2026-10-07');
      expect(result.estimatedDeliveryDays).toBe(7);
      expect(result.formattedDate).toBe('7 Oct');
    });

    it('should return unserviceable message when not available', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockResolvedValue({
        isServiceable: false,
      });

      const result = await service.getEstimate({
        pincode: '190001',
        variantId: 'var-1.2kg',
      });

      expect(result.available).toBe(false);
      expect(result.message).toBe(
        'Delivery is currently unavailable for this pincode.',
      );
    });

    it('should handle provider API failure gracefully', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockRejectedValue(
        new Error('Ekart API Network Error'),
      );

      const result = await service.getEstimate({
        pincode: '400612',
        variantId: 'var-1.2kg',
      });

      expect(result.available).toBe(false);
      expect(result.message).toBe(
        "Couldn't check delivery right now. Please try again.",
      );
    });

    it('should calculate ETA from estimatedDeliveryDays when date string is missing', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-test',
        shippingWeightKg: 0.8,
      });

      mockCheckServiceability.mockResolvedValue({
        isServiceable: true,
        estimatedDeliveryDays: 5,
      });

      const result = await service.getEstimate({
        pincode: '560001',
        variantId: 'var-test',
      });

      expect(result.available).toBe(true);
      expect(result.estimatedDeliveryDays).toBe(5);
      expect(result.estimatedDeliveryDate).toBeDefined();
      expect(result.formattedDate).toBeDefined();
    });

    it('should cache result and avoid duplicate queries for same inputs', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-cached',
        shippingWeightKg: 1.5,
      });

      mockCheckServiceability.mockResolvedValue({
        isServiceable: true,
        estimatedDeliveryDate: '2026-10-07',
        estimatedDeliveryDays: 7,
        courierGroup: 'Ekart SURFACE',
      });

      const firstCall = await service.getEstimate({
        pincode: '400001',
        variantId: 'var-cached',
      });

      expect(mockCheckServiceability).toHaveBeenCalledTimes(1);
      expect(firstCall.available).toBe(true);

      const secondCall = await service.getEstimate({
        pincode: '400001',
        variantId: 'var-cached',
      });

      expect(mockCheckServiceability).toHaveBeenCalledTimes(1);
      expect(secondCall).toEqual(firstCall);
    });
  });

  describe('Integration with ShippingService', () => {
    it('uses ShippingService.getShippingProvider() when injected', async () => {
      const mockShippingService = {
        getShippingProvider: jest.fn().mockReturnValue(ekartProvider),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DeliveryEstimateService,
          { provide: ShippingService, useValue: mockShippingService },
          { provide: PrismaService, useValue: prismaService },
          { provide: ConfigService, useValue: configService },
          { provide: RedisService, useFactory: () => {
            const store = new Map<string, any>();
            return {
              get: jest.fn(async (key: string) => store.has(key) ? store.get(key) : null),
              set: jest.fn(async (key: string, value: any) => { store.set(key, value); }),
              del: jest.fn(async (key: string | string[]) => { const keys = Array.isArray(key) ? key : [key]; keys.forEach(k => store.delete(k)); }),
              delByPattern: jest.fn(),
              setNX: jest.fn().mockResolvedValue(true),
              releaseLock: jest.fn().mockResolvedValue(true),
              incr: jest.fn().mockResolvedValue(1),
              expire: jest.fn(),
              zincrby: jest.fn().mockResolvedValue('1'),
              zrevrange: jest.fn().mockResolvedValue([]),
              ping: jest.fn().mockResolvedValue(true),
            };
          } },
        ],
      }).compile();

      const dynamicService = module.get<DeliveryEstimateService>(
        DeliveryEstimateService,
      );

      mockCheckServiceability.mockResolvedValue({
        isServiceable: true,
        estimatedDeliveryDays: 5,
      });

      const res = await dynamicService.getEstimate({ pincode: '400612' });

      expect(mockShippingService.getShippingProvider).toHaveBeenCalled();
      expect(res.available).toBe(true);
    });
  });
});
