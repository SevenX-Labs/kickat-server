import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShiprocketProvider } from './providers/shiprocket.provider';
import { DeliveryEstimateService } from './delivery-estimate.service';

describe('DeliveryEstimateService', () => {
  let service: DeliveryEstimateService;
  let shiprocketProvider: jest.Mocked<Partial<ShiprocketProvider>>;
  let prismaService: any;
  let configService: jest.Mocked<Partial<ConfigService>>;

  const mockPickupLocationPincode = jest.fn();
  const mockCheckServiceability = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPickupLocationPincode.mockResolvedValue('721643');

    shiprocketProvider = {
      getPickupLocationPincode: mockPickupLocationPincode,
      checkServiceability: mockCheckServiceability,
    };

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
        if (key === 'SHIPROCKET_PICKUP_LOCATION') return "Bhim's";
        if (key === 'SHIPROCKET_PICKUP_PINCODE') return '721643';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryEstimateService,
        { provide: ShiprocketProvider, useValue: shiprocketProvider },
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
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
      expect(mockCheckServiceability).not.toHaveBeenCalled();
    });

    it('should reject invalid pincodes (starting with 0)', async () => {
      const res = await service.getEstimate({ pincode: '012345' });
      expect(res.available).toBe(false);
      expect(res.message).toBe('Enter a valid 6-digit pincode.');
      expect(mockCheckServiceability).not.toHaveBeenCalled();
    });
  });

  describe('Serviceability & ETA Parsing', () => {
    it('should return valid ETA for 1.2 Kg variant (audited real scenario)', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        name: '1.2 Kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockResolvedValue({
        status: 200,
        data: {
          recommended_courier_company_id: 44,
          available_courier_companies: [
            {
              courier_company_id: 44,
              courier_name: 'Delhivery Surface 2 Kgs',
              etd: 'Oct 07, 2026',
              estimated_delivery_days: 7,
              etd_hours: 168,
              rating: 4.5,
              rate: 105,
            },
            {
              courier_company_id: 28,
              courier_name: 'Blue Dart Surface',
              etd: 'Oct 08, 2026',
              estimated_delivery_days: 8,
              etd_hours: 192,
              rating: 4.2,
              rate: 120,
            },
          ],
        },
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
      expect(result.courierName).toBe('Delhivery Surface 2 Kgs');
      expect(result.estimatedDeliveryDate).toBe('2026-10-07');
      expect(result.estimatedDeliveryDays).toBe(7);
      expect(result.formattedDate).toBe('7 Oct');
    });

    it('should query separate weight for 3 Kg variant and not reuse 1.2 Kg estimate', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-3kg',
        name: '3 Kg',
        shippingWeightKg: 3.0,
      });

      mockCheckServiceability.mockResolvedValue({
        status: 200,
        data: {
          recommended_courier_company_id: 52,
          available_courier_companies: [
            {
              courier_company_id: 52,
              courier_name: 'Smartr Surface 5 Kgs',
              etd: 'Oct 09, 2026',
              estimated_delivery_days: 9,
            },
          ],
        },
      });

      const result = await service.getEstimate({
        pincode: '400612',
        variantId: 'var-3kg',
      });

      expect(mockCheckServiceability).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupPostcode: '721643',
          deliveryPostcode: '400612',
          weight: 3.0,
          cod: true,
        }),
      );

      expect(result.available).toBe(true);
      expect(result.courierName).toBe('Smartr Surface 5 Kgs');
      expect(result.estimatedDeliveryDate).toBe('2026-10-09');
      expect(result.estimatedDeliveryDays).toBe(9);
      expect(result.formattedDate).toBe('9 Oct');
    });

    it('should return unserviceable message when no couriers are available', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockResolvedValue({
        status: 200,
        data: {
          available_courier_companies: [],
        },
      });

      const result = await service.getEstimate({
        pincode: '190001',
        variantId: 'var-1.2kg',
      });

      expect(result.available).toBe(false);
      expect(result.message).toBe('Delivery is currently unavailable for this pincode.');
    });

    it('should handle Shiprocket serviceability API failure gracefully', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-1.2kg',
        shippingWeightKg: 1.2,
      });

      mockCheckServiceability.mockRejectedValue(new Error('Shiprocket API Network Error'));

      const result = await service.getEstimate({
        pincode: '400612',
        variantId: 'var-1.2kg',
      });

      expect(result.available).toBe(false);
      expect(result.message).toBe("Couldn't check delivery right now. Please try again.");
    });

    it('should calculate ETA from estimated_delivery_days when etd string is missing', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-test',
        shippingWeightKg: 0.8,
      });

      mockCheckServiceability.mockResolvedValue({
        status: 200,
        data: {
          available_courier_companies: [
            {
              courier_company_id: 10,
              courier_name: 'Express Courier',
              estimated_delivery_days: 5,
            },
          ],
        },
      });

      const result = await service.getEstimate({
        pincode: '560001',
        variantId: 'var-test',
      });

      expect(result.available).toBe(true);
      expect(result.courierName).toBe('Express Courier');
      expect(result.estimatedDeliveryDays).toBe(5);
      expect(result.estimatedDeliveryDate).toBeDefined();
      expect(result.formattedDate).toBeDefined();
    });

    it('should cache result and avoid duplicate Shiprocket queries for same inputs', async () => {
      prismaService.productVariant.findUnique.mockResolvedValue({
        id: 'var-cached',
        shippingWeightKg: 1.5,
      });

      mockCheckServiceability.mockResolvedValue({
        status: 200,
        data: {
          available_courier_companies: [
            {
              courier_company_id: 44,
              courier_name: 'Delhivery Surface',
              etd: 'Oct 07, 2026',
              estimated_delivery_days: 7,
            },
          ],
        },
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

      expect(mockCheckServiceability).toHaveBeenCalledTimes(1); // Not called again!
      expect(secondCall).toEqual(firstCall);
    });
  });
});
