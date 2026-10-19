import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DelhiveryProvider } from './delhivery.provider';
import { CreateShipmentParams } from './shipping-provider.interface';

describe('DelhiveryProvider', () => {
  let provider: DelhiveryProvider;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;

  const mockConfig: Record<string, string> = {
    DELHIVERY_API_KEY: 'mock-delhivery-secret-token-12345',
    DELHIVERY_BASE_URL: 'https://track.delhivery.com',
    DELHIVERY_PICKUP_LOCATION: 'KickAt Central Warehouse',
    DELHIVERY_SHIPPING_MODE: 'Surface',
  };

  const sampleShipmentParams: CreateShipmentParams = {
    orderId: 'ord-uuid-101',
    orderNumber: 'ORD-2026-001',
    orderDate: new Date('2026-10-15T10:00:00Z'),
    paymentMethod: 'COD',
    subtotal: 1200,
    discount: 100,
    deliveryFee: 50,
    taxAmount: 60,
    grandTotal: 1210,
    pickupLocation: 'KickAt Central Warehouse',
    packageDetails: {
      weight: 1.2,
      length: 15,
      breadth: 12,
      height: 10,
    },
    customer: {
      name: 'Sahil Hode',
      email: 'sahil@example.com',
      phone: '+91 9876543210',
    },
    shippingAddress: {
      name: 'Sahil Hode',
      phone: '+91 9876543210',
      houseFlat: 'Flat 402, Sunshine Heights',
      buildingStreet: 'MG Road',
      landmark: 'Near Metro Station',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India',
    },
    items: [
      {
        productId: 'prod-1',
        productName: 'Cat Scratch Post',
        quantity: 1,
        price: 1200,
        totalPrice: 1200,
      },
    ],
  };

  const samplePincodeResponse = {
    delivery_codes: [
      {
        postal_code: {
          remarks: '',
          pin: 400612,
          country_code: 'IN',
          state_code: 'MH',
          cod: 'Y',
          pre_paid: 'Y',
          pickup: 'Y',
          cash: 'Y',
          repl: 'Y',
          district: 'Thane',
          is_oda: 'N',
          sort_code: 'MUM/LIP',
          max_amount: 0.0,
          max_weight: 0.0,
          covid_zone: 'G',
          city: 'Greater Thane',
          sun_tat: true,
          protect_blacklist: false,
          srv_wt_th: 10000.0,
        },
      },
    ],
  };

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelhiveryProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              return mockConfig[key] ?? defaultValue ?? '';
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<DelhiveryProvider>(DelhiveryProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('1. Registration and Configuration', () => {
    it('is registered in NestJS with providerName DELHIVERY', () => {
      expect(provider).toBeDefined();
      expect(provider.providerName).toBe('DELHIVERY');
    });

    it('returns isConfigured() = true when API key is present', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('returns isConfigured() = false when API key is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('');
      expect(provider.isConfigured()).toBe(false);
    });

    it('throws clear error when requesting API with missing API key', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('');
      await expect(
        provider.checkServiceability({
          pickupPostcode: '400001',
          deliveryPostcode: '400612',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow(
        'Delhivery credentials missing: DELHIVERY_API_KEY must be set',
      );
    });

    it('normalizes base URL and trims trailing slashes', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DELHIVERY_API_KEY') return 'test-key';
        if (key === 'DELHIVERY_BASE_URL') return 'https://track.delhivery.com///';
        return '';
      });

      let requestedUrl = '';
      global.fetch = jest.fn().mockImplementation((url: string) => {
        requestedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ delivery_codes: [] }),
        } as Response);
      });

      await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 0.5,
        cod: false,
      });

      expect(requestedUrl).toBe(
        'https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=400612',
      );
    });
  });

  describe('2. PIN-code Serviceability', () => {
    it('sends correct Authorization: Token header and query params', async () => {
      let capturedHeaders: Record<string, string> = {};
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(samplePincodeResponse),
        } as Response);
      });

      const res = await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 1.0,
        cod: true,
      });

      expect(capturedHeaders['Authorization']).toBe(
        'Token mock-delhivery-secret-token-12345',
      );
      expect(capturedHeaders['Accept']).toBe('application/json');
      expect(res.isServiceable).toBe(true);
      expect(res.city).toBe('Greater Thane');
      expect(res.district).toBe('Thane');
      expect(res.state).toBe('MH');
      expect(res.codAvailable).toBe(true);
      expect(res.prepaidAvailable).toBe(true);
      expect(res.isOda).toBe(false);
      expect(res.sortCode).toBe('MUM/LIP');
    });

    it('rejects invalid pincode formats without calling API', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      const res = await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '1234',
        weight: 0.5,
        cod: false,
      });

      expect(res.isServiceable).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns isServiceable: false when COD requested but postal code has cod = N', async () => {
      const codDisabledResponse = {
        delivery_codes: [
          {
            postal_code: {
              ...samplePincodeResponse.delivery_codes[0].postal_code,
              cod: 'N',
              pre_paid: 'Y',
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(codDisabledResponse),
      } as Response);

      const res = await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 1.0,
        cod: true,
      });

      expect(res.isServiceable).toBe(false);
      expect(res.codAvailable).toBe(false);
      expect(res.prepaidAvailable).toBe(true);
    });

    it('returns isServiceable: false when delivery_codes is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ delivery_codes: [] }),
      } as Response);

      const res = await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '999999',
        weight: 1.0,
        cod: false,
      });

      expect(res.isServiceable).toBe(false);
    });

    it('identifies Out of Delivery Area (ODA) flag correctly', async () => {
      const odaResponse = {
        delivery_codes: [
          {
            postal_code: {
              ...samplePincodeResponse.delivery_codes[0].postal_code,
              is_oda: 'Y',
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(odaResponse),
      } as Response);

      const res = await provider.checkServiceability({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 1.0,
        cod: false,
      });

      expect(res.isOda).toBe(true);
    });
  });

  describe('3. Recommended Courier Selection', () => {
    it('returns courier recommendation when serviceable', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(samplePincodeResponse),
      } as Response);

      const courier = await provider.getRecommendedCourier({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 1.0,
        cod: false,
      });

      expect(courier).not.toBeNull();
      expect(courier?.courierCompanyId).toBe('delhivery');
      expect(courier?.courierName).toBe('Delhivery Surface');
      expect(courier?.isRecommended).toBe(true);
    });

    it('reflects Express mode when configured in environment', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DELHIVERY_API_KEY') return 'test-key';
        if (key === 'DELHIVERY_SHIPPING_MODE') return 'Express';
        return '';
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(samplePincodeResponse),
      } as Response);

      const courier = await provider.getRecommendedCourier({
        pickupPostcode: '400001',
        deliveryPostcode: '400612',
        weight: 1.0,
        cod: false,
      });

      expect(courier?.courierName).toBe('Delhivery Express');
    });

    it('returns null when pincode is not serviceable', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ delivery_codes: [] }),
      } as Response);

      const courier = await provider.getRecommendedCourier({
        pickupPostcode: '400001',
        deliveryPostcode: '999999',
        weight: 1.0,
        cod: false,
      });

      expect(courier).toBeNull();
    });
  });

  describe('4. Tracking by AWB (getShipmentTrackingByAwb)', () => {
    const sampleTrackingResponse = {
      ShipmentData: [
        {
          Shipment: {
            AWB: '1234567890123',
            Status: {
              Status: 'In Transit',
              StatusDateTime: '2026-10-15T08:30:00.000Z',
              StatusType: 'UD',
              Instructions: 'Package moving to hub',
              StatusLocation: 'Bhiwandi Hub',
            },
            Scans: [
              {
                ScanDetail: {
                  ScanDateTime: '2026-10-14T18:00:00.000Z',
                  ScanType: 'UD',
                  Scan: 'Manifested',
                  StatusDateTime: '2026-10-14T18:00:00.000Z',
                  ScannedLocation: 'Mumbai Central',
                  Instructions: 'Shipment Created',
                },
              },
              {
                ScanDetail: {
                  ScanDateTime: '2026-10-15T08:30:00.000Z',
                  ScanType: 'UD',
                  Scan: 'In Transit',
                  StatusDateTime: '2026-10-15T08:30:00.000Z',
                  ScannedLocation: 'Bhiwandi Hub',
                  Instructions: 'Package received at hub',
                },
              },
            ],
            ExpectedDeliveryDate: '2026-10-18T18:00:00.000Z',
            PickUpDate: '2026-10-14T19:00:00.000Z',
          },
        },
      ],
    };

    it('successfully calls tracking endpoint and parses shipment scans', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn().mockImplementation((url) => {
        requestedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleTrackingResponse),
        } as Response);
      });

      const res = await provider.getShipmentTrackingByAwb('1234567890123');

      expect(requestedUrl).toBe(
        'https://track.delhivery.com/api/v1/packages/json/?waybill=1234567890123',
      );
      expect(res.awb).toBe('1234567890123');
      expect(res.currentStatus).toBe('In Transit');
      expect(res.etd).toBe('2026-10-18T18:00:00.000Z');
      expect(res.trackUrl).toBe(
        'https://www.delhivery.com/track/package/1234567890123',
      );
      expect(res.activities).toHaveLength(2);
      expect(res.activities[0].status).toBe('Manifested');
      expect(res.activities[0].location).toBe('Mumbai Central');
      expect(res.activities[1].status).toBe('In Transit');
      expect(res.activities[1].location).toBe('Bhiwandi Hub');
    });

    it('throws error if AWB is empty', async () => {
      await expect(provider.getShipmentTrackingByAwb('')).rejects.toThrow(
        'AWB is required to fetch Delhivery tracking',
      );
    });

    it('handles empty shipment tracking data gracefully without throwing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ShipmentData: [] }),
      } as Response);

      const res = await provider.getShipmentTrackingByAwb('9999999999');
      expect(res.awb).toBe('9999999999');
      expect(res.activities).toEqual([]);
      expect(res.currentStatus).toBeNull();
      expect(res.etd).toBeNull();
    });
  });

  describe('5. Forward Shipment Creation (createShipment)', () => {
    const sampleCreateSuccessResponse = {
      cash_pickups_count: 0,
      package_count: 1,
      upload_wbn: 'UP-WBN-998877',
      replacement_count: 0,
      rmk: 'None',
      packages: [
        {
          status: 'Success',
          client: 'KICKAT',
          sort_code: 'MUM/LIP',
          remarks: [],
          waybill: '1234567890123',
          cod_amount: 1210,
          payment: 'COD',
          serviceable: true,
        },
      ],
      success: true,
    };

    it('successfully posts CMU push payload and extracts waybill', async () => {
      let capturedBody = '';
      let capturedMethod = '';
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedMethod = init?.method || '';
        capturedBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleCreateSuccessResponse),
        } as Response);
      });

      const res = await provider.createShipment(sampleShipmentParams);

      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toContain('format=json&data=');

      // Decode and check CMU payload structure
      const parsedBody = new URLSearchParams(capturedBody);
      const cmuJson = JSON.parse(parsedBody.get('data') || '{}');
      expect(cmuJson.shipments).toHaveLength(1);

      const shipment = cmuJson.shipments[0];
      expect(shipment.name).toBe('Sahil Hode');
      expect(shipment.phone).toBe('9876543210');
      expect(shipment.pin).toBe('400001');
      expect(shipment.payment_mode).toBe('COD');
      expect(shipment.cod_amount).toBe('1210.00');
      expect(shipment.total_amount).toBe('1210.00');
      expect(shipment.weight).toBe(1200); // 1.2 kg in grams

      expect(cmuJson.pickup_location.name).toBe('KickAt Central Warehouse');

      expect(res.isConfigured).toBe(true);
      expect(res.providerName).toBe('DELHIVERY');
      expect(res.awbCode).toBe('1234567890123');
      expect(res.shipmentId).toBe('1234567890123');
      expect(res.orderId).toBe('UP-WBN-998877');
      expect(res.courierName).toBe('Delhivery');
    });

    it('formats prepaid order parameters correctly', async () => {
      let capturedBody = '';
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleCreateSuccessResponse),
        } as Response);
      });

      const prepaidParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        paymentMethod: 'ONLINE',
      };

      await provider.createShipment(prepaidParams);

      const parsedBody = new URLSearchParams(capturedBody);
      const cmuJson = JSON.parse(parsedBody.get('data') || '{}');
      const shipment = cmuJson.shipments[0];
      expect(shipment.payment_mode).toBe('Prepaid');
      expect(shipment.cod_amount).toBe('0');
    });

    it('throws error when customer phone is invalid', async () => {
      const invalidPhoneParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        customer: {
          name: 'Test',
          phone: '12345',
        },
      };

      await expect(provider.createShipment(invalidPhoneParams)).rejects.toThrow(
        'Valid 10-digit Indian phone number is required',
      );
    });

    it('throws error when Delhivery API returns failure response', async () => {
      const failResponse = {
        success: false,
        packages: [
          {
            status: 'Fail',
            remarks: ['Pincode is unserviceable for COD'],
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(failResponse),
      } as Response);

      await expect(
        provider.createShipment(sampleShipmentParams),
      ).rejects.toThrow(
        'Delhivery shipment creation failed: Pincode is unserviceable for COD',
      );
    });

    it('assignAwb returns existing waybill as success', async () => {
      const result = await provider.assignAwb({
        shipmentId: '1234567890123',
        courierId: 'delhivery',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.awbCode).toBe('1234567890123');
      expect(result.courierName).toBe('Delhivery');
    });
  });

  describe('6. Shipment Cancellation (cancelShipment)', () => {
    it('calls /api/p/edit with waybill and cancellation: "true"', async () => {
      let capturedBody = '';
      let capturedUrl = '';
      global.fetch = jest.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: true,
              message: 'Package cancelled successfully',
            }),
        } as Response);
      });

      const res = await provider.cancelShipment({
        shiprocketShipmentId: '1234567890123',
      });

      expect(capturedUrl).toBe('https://track.delhivery.com/api/p/edit');
      expect(JSON.parse(capturedBody)).toEqual({
        waybill: '1234567890123',
        cancellation: 'true',
      });
      expect(res.success).toBe(true);
      expect(res.message).toContain('1234567890123 cancelled successfully');
    });

    it('returns success: false when no waybill identifier is provided', async () => {
      const res = await provider.cancelShipment({});
      expect(res.success).toBe(false);
      expect(res.message).toContain('No waybill identifier supplied');
    });

    it('handles cancellation rejection safely', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: false,
            message: 'Package already out for delivery',
          }),
      } as Response);

      const res = await provider.cancelShipment({
        shiprocketShipmentId: '1234567890123',
      });

      expect(res.success).toBe(false);
      expect(res.message).toBe('Package already out for delivery');
    });
  });

  describe('7. Security, Timeout and Return Stubs', () => {
    it('handles network timeout safely', async () => {
      const abortError = new Error('The operation was aborted due to timeout');
      abortError.name = 'TimeoutError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(
        provider.checkServiceability({
          pickupPostcode: '400001',
          deliveryPostcode: '400612',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow('Delhivery API request to /c/api/pin-codes/json/?filter_codes=400612 timed out');
    });

    it('never leaks API token into Logger outputs', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error');
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Internal failure' }),
      } as Response);

      await expect(
        provider.checkServiceability({
          pickupPostcode: '400001',
          deliveryPostcode: '400612',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow('Delhivery API error [500]');

      for (const call of loggerSpy.mock.calls) {
        expect(call[0]).not.toContain('mock-delhivery-secret-token-12345');
      }
    });

    it('return pickup stubs return safe pending-integration states', async () => {
      const returnRes = await provider.createReturnPickup({
        returnId: 'ret-1',
        orderId: 'ord-1',
        orderNumber: 'ORD-1',
        pickupAddress: {
          houseFlat: '10',
          buildingStreet: 'Street',
          city: 'Mumbai',
          state: 'MH',
          pincode: '400001',
        },
        items: [{ productName: 'Item', quantity: 1, reason: 'Damaged' }],
      });

      expect(returnRes.status).toBe('PENDING_INTEGRATION');
      expect(returnRes.providerName).toBe('DELHIVERY');

      const trackingRes = await provider.getReturnTracking('shp-1');
      expect(trackingRes.currentStatus).toBe('PENDING_INTEGRATION');

      const cancelRes = await provider.cancelReturnPickup('shp-1');
      expect(cancelRes).toBe(false);

      const updateRes = await provider.handleTrackingUpdate();
      expect(updateRes.status).toBe('PENDING_INTEGRATION');
    });
  });

  describe('8. Pickup Location and Pincode Explicit Configuration Safety', () => {
    it('fails safely when DELHIVERY_PICKUP_LOCATION is missing and does not fallback to Shiprocket location', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DELHIVERY_API_KEY') return 'mock-key';
        if (key === 'DELHIVERY_BASE_URL') return 'https://track.delhivery.com';
        if (key === 'SHIPROCKET_PICKUP_LOCATION') return 'Shiprocket Main Warehouse';
        return '';
      });

      const paramsWithoutExplicitPickup: CreateShipmentParams = {
        ...sampleShipmentParams,
        pickupLocation: undefined,
      };

      await expect(
        provider.createShipment(paramsWithoutExplicitPickup),
      ).rejects.toThrow(
        'Delhivery pickup location is not configured. Configure DELHIVERY_PICKUP_LOCATION in environment or provide pickupLocation in params.',
      );
    });

    it('getPickupLocationPincode returns null when DELHIVERY_PICKUP_PINCODE is missing and does not fallback to Shiprocket pincode', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SHIPROCKET_PICKUP_PINCODE') return '721643';
        return '';
      });

      const pin = await provider.getPickupLocationPincode('AnyWarehouse');
      expect(pin).toBeNull();
    });

    it('getPickupLocationPincode returns valid 6-digit pincode when DELHIVERY_PICKUP_PINCODE is explicitly set', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'DELHIVERY_PICKUP_PINCODE') return '400001';
        return '';
      });

      const pin = await provider.getPickupLocationPincode('AnyWarehouse');
      expect(pin).toBe('400001');
    });
  });
});
