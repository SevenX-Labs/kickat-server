import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ShiprocketCreateOrderPayload,
  ShiprocketProvider,
} from './shiprocket.provider';
import { NullShippingProvider } from './null-shipping.provider';
import { Logger } from '@nestjs/common';
import { CreateShipmentParams } from './shipping-provider.interface';

describe('ShiprocketProvider', () => {
  let provider: ShiprocketProvider;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;

  const mockConfig: Record<string, string> = {
    SHIPROCKET_EMAIL: 'api-user@example.com',
    SHIPROCKET_PASSWORD: 'securePassword123!',
    SHIPROCKET_PICKUP_LOCATION: 'Primary Warehouse',
  };

  const createMockJwt = (expInSecondsFromNow: number = 864000): string => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const exp = Math.floor(Date.now() / 1000) + expInSecondsFromNow;
    const payload = Buffer.from(
      JSON.stringify({
        id: 12345,
        email: 'api-user@example.com',
        exp,
      }),
    ).toString('base64');
    const signature = 'mockSignature456';
    return `${header}.${payload}.${signature}`;
  };

  const sampleShipmentParams: CreateShipmentParams = {
    orderId: 'ord-uuid-101',
    orderNumber: 'ORD-2026-001',
    orderDate: new Date('2026-09-29T12:00:00Z'),
    paymentMethod: 'COD',
    subtotal: 1200,
    discount: 100,
    deliveryFee: 50,
    taxAmount: 60,
    grandTotal: 1210,
    pickupLocation: 'Primary Warehouse',
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
        productName: 'Premium Cat Food',
        variantName: '2kg Bag',
        sku: 'CAT-FOOD-2KG',
        quantity: 2,
        price: 600,
        totalPrice: 1200,
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
        ShiprocketProvider,
        NullShippingProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: string = '') => {
              return mockConfig[key] ?? defaultVal;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<ShiprocketProvider>(ShiprocketProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('12. Provider is correctly registered in NestJS', () => {
    expect(provider).toBeDefined();
    expect(provider.providerName).toBe('SHIPROCKET');
    expect(provider.isConfigured()).toBe(true);
  });

  describe('Configuration & Credentials', () => {
    it('1. Missing credentials throws clear configuration error', async () => {
      (configService.get as jest.Mock).mockReturnValue('');

      expect(provider.isConfigured()).toBe(false);
      await expect(provider.authenticate()).rejects.toThrow(
        /Shiprocket credentials missing/,
      );
    });
  });

  describe('Authentication & Token Caching', () => {
    it('2. Successful authentication stores token and expiry in memory', async () => {
      const mockToken = createMockJwt(864000); // 10 days
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: mockToken }),
      });

      const token: string = await provider.authenticate();

      expect(token).toBe(mockToken);
      expect(provider.hasCachedToken()).toBe(true);
      expect(provider.getTokenExpiresAt()).toBeGreaterThan(Date.now());
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://apiv2.shiprocket.in/v1/external/auth/login',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('3. Existing valid token returns cached token without login request', async () => {
      const mockToken = createMockJwt(864000); // 10 days
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: mockToken }),
      });

      // First call authenticates
      const token1 = await provider.getValidToken();
      expect(token1).toBe(mockToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call uses memory cache
      const token2 = await provider.getValidToken();
      expect(token2).toBe(mockToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('4. Expired token triggers re-authentication', async () => {
      const expiredToken = createMockJwt(-3600); // Expired 1 hour ago
      const freshToken = createMockJwt(864000);

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: expiredToken }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: freshToken }),
        });

      await provider.authenticate();

      const validToken = await provider.getValidToken();
      expect(validToken).toBe(freshToken);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('5. Token near expiry (within buffer) triggers proactive refresh', async () => {
      const nearExpiryToken = createMockJwt(10 * 60); // 10 mins remaining (< 30 min buffer)
      const freshToken = createMockJwt(864000);

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: nearExpiryToken }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: freshToken }),
        });

      await provider.authenticate();

      const validToken = await provider.getValidToken();
      expect(validToken).toBe(freshToken);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('6. Concurrent requests with expired token share single in-flight login promise', async () => {
      const freshToken = createMockJwt(864000);

      let resolveAuth: (val: unknown) => void;
      const authPromise = new Promise((resolve) => {
        resolveAuth = resolve;
      });

      global.fetch = jest.fn().mockImplementation(() =>
        authPromise.then(() => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: freshToken }),
        })),
      );

      const reqA = provider.getValidToken();
      const reqB = provider.getValidToken();
      const reqC = provider.getValidToken();

      resolveAuth!(true);

      const [resA, resB, resC] = await Promise.all([reqA, reqB, reqC]);

      expect(resA).toBe(freshToken);
      expect(resB).toBe(freshToken);
      expect(resC).toBe(freshToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Forward Shipment Creation (createShipment)', () => {
    it('1. Correctly maps KickAt order parameters to Shiprocket create order payload', async () => {
      const token = createMockJwt(864000);

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              order_id: 11223344,
              shipment_id: 55667788,
              status: 'NEW',
              status_code: 1,
            }),
        });

      const result = await provider.createShipment(sampleShipmentParams);

      expect(result.isConfigured).toBe(true);
      expect(result.providerName).toBe('SHIPROCKET');
      expect(result.orderId).toBe('11223344');
      expect(result.shipmentId).toBe('55667788');
      expect(result.status).toBe('NEW');
      expect(result.statusCode).toBe(1);

      const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[0]).toBe(
        'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      );
      const reqInit = secondCall[1] as RequestInit;
      const parsedPayload = JSON.parse(
        reqInit.body as string,
      ) as ShiprocketCreateOrderPayload;

      expect(parsedPayload.order_id).toBe('ORD-2026-001');
      expect(parsedPayload.pickup_location).toBe('Primary Warehouse');
      expect(parsedPayload.billing_customer_name).toBe('Sahil');
      expect(parsedPayload.billing_last_name).toBe('Hode');
      expect(parsedPayload.billing_phone).toBe('9876543210');
      expect(parsedPayload.billing_city).toBe('Mumbai');
      expect(parsedPayload.billing_state).toBe('Maharashtra');
      expect(parsedPayload.billing_pincode).toBe('400001');
      expect(parsedPayload.payment_method).toBe('COD');
      expect(parsedPayload.sub_total).toBe(1200);
      expect(parsedPayload.shipping_charges).toBe(50);
      expect(parsedPayload.total_discount).toBe(100);
      expect(parsedPayload.weight).toBe(1.2);
      expect(parsedPayload.order_items.length).toBe(1);
      expect(parsedPayload.order_items[0].name).toBe(
        'Premium Cat Food (2kg Bag)',
      );
      expect(parsedPayload.order_items[0].sku).toBe('CAT-FOOD-2KG');
      expect(parsedPayload.order_items[0].units).toBe(2);
      expect(parsedPayload.order_items[0].selling_price).toBe(600);
    });

    it('2. Correctly maps prepaid payment method for non-COD orders', async () => {
      const token = createMockJwt(864000);
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              order_id: 11223345,
              shipment_id: 55667789,
              status: 'NEW',
            }),
        });

      const prepaidParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        paymentMethod: 'RAZORPAY',
      };

      await provider.createShipment(prepaidParams);

      const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
      const secondCall = fetchMock.mock.calls[1];
      const reqInit = secondCall[1] as RequestInit;
      const parsedPayload = JSON.parse(
        reqInit.body as string,
      ) as ShiprocketCreateOrderPayload;
      expect(parsedPayload.payment_method).toBe('Prepaid');
    });

    it('3. Throws clear error if pickup location is not configured or provided', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'SHIPROCKET_PICKUP_LOCATION') return '';
        return mockConfig[key] || '';
      });

      const invalidParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        pickupLocation: undefined,
      };

      await expect(provider.createShipment(invalidParams)).rejects.toThrow(
        /Shiprocket pickup location is not configured/,
      );
    });

    it('4. Validates required customer details and phone formatting', async () => {
      const invalidPhoneParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        customer: { name: 'Sahil', email: 'sahil@example.com', phone: '123' },
      };

      await expect(provider.createShipment(invalidPhoneParams)).rejects.toThrow(
        /Valid customer phone number/,
      );

      const missingNameParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        customer: { name: '', email: 'sahil@example.com', phone: '9876543210' },
        shippingAddress: { ...sampleShipmentParams.shippingAddress, name: '' },
      };

      await expect(provider.createShipment(missingNameParams)).rejects.toThrow(
        /Customer name is required/,
      );
    });

    it('5. Validates required shipping address fields (city, state, pincode)', async () => {
      const missingAddressParams: CreateShipmentParams = {
        ...sampleShipmentParams,
        shippingAddress: {
          ...sampleShipmentParams.shippingAddress,
          pincode: '',
        },
      };

      await expect(
        provider.createShipment(missingAddressParams),
      ).rejects.toThrow(/Shipping city, state, and pincode are required/);
    });

    it('6. Handles Shiprocket 422 Unprocessable Entity gracefully', async () => {
      const token = createMockJwt(864000);
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: () =>
            Promise.resolve({ message: 'Pickup postcode is unserviceable' }),
        });

      await expect(
        provider.createShipment(sampleShipmentParams),
      ).rejects.toThrow(
        /Shiprocket API error \[422\].*Pickup postcode is unserviceable/,
      );
    });

    it('7. Handles Shiprocket 429 Rate Limit error gracefully', async () => {
      const token = createMockJwt(864000);
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({ message: 'API Rate limit exceeded' }),
        });

      await expect(
        provider.createShipment(sampleShipmentParams),
      ).rejects.toThrow(/Shiprocket API error \[429\].*Rate limit/);
    });

    it('8. Handles network timeout on shipment creation safely', async () => {
      const token = createMockJwt(864000);
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token }),
        })
        .mockRejectedValueOnce(timeoutErr);

      await expect(
        provider.createShipment(sampleShipmentParams),
      ).rejects.toThrow(/request to .* timed out/);
    });
  });

  describe('Authenticated Requests & 401 Retry Handling', () => {
    it('9. Shiprocket HTTP 401 invalidates cache, refreshes token and retries request once', async () => {
      const token1 = createMockJwt(864000);
      const token2 = createMockJwt(864000);

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token1 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Token Expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 200,
              data: {
                available_courier_companies: [{ courier_name: 'Blue Dart' }],
              },
            }),
        });

      const result = await provider.checkServiceability<{
        status: number;
        data: { available_courier_companies: Array<{ courier_name: string }> };
      }>({
        pickupPostcode: '110001',
        deliveryPostcode: '560001',
        weight: 0.5,
        cod: false,
      });

      expect(result.status).toBe(200);
      expect(result.data.available_courier_companies.length).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('10. Second consecutive 401 fails safely without infinite retry', async () => {
      const token1 = createMockJwt(864000);
      const token2 = createMockJwt(864000);

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token1 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Invalid Token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token2 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Still Unauthorized' }),
        });

      await expect(
        provider.checkServiceability({
          pickupPostcode: '110001',
          deliveryPostcode: '560001',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow(/unauthorized \(401\)/i);

      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Security & Logging', () => {
    it('11. Sensitive credentials, passwords, and tokens never appear in Logger output', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      const mockToken = createMockJwt(864000);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: mockToken }),
      });

      await provider.authenticate();

      const logs = (logSpy.mock.calls as string[][]).flat();
      const warns = (warnSpy.mock.calls as string[][]).flat();
      const errors = (errorSpy.mock.calls as string[][]).flat();
      const allLogMessages = [...logs, ...warns, ...errors].join(' ');

      expect(allLogMessages).not.toContain(mockConfig.SHIPROCKET_PASSWORD);
      expect(allLogMessages).not.toContain(mockToken);
      expect(allLogMessages).not.toContain('Bearer');

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Interface Fallbacks & Stubs', () => {
    it('13. ShippingProvider return pickup stubs return safe pending-integration responses', async () => {
      const returnResult = await provider.createReturnPickup({
        returnId: 'ret-1',
        orderId: 'ord-1',
        orderNumber: 'ORD-1001',
        pickupAddress: {
          houseFlat: '101',
          buildingStreet: 'Main St',
          city: 'Mumbai',
          state: 'MH',
          pincode: '400001',
        },
        items: [{ productName: 'Item A', quantity: 1, reason: 'Defective' }],
      });

      expect(returnResult.isConfigured).toBe(true);
      expect(returnResult.providerName).toBe('SHIPROCKET');
      expect(returnResult.status).toBe('PENDING_INTEGRATION');
      expect(returnResult.awbNumber).toBeNull();

      const trackingResult = await provider.getReturnTracking('shp-123');
      expect(trackingResult.isConfigured).toBe(true);
      expect(trackingResult.providerName).toBe('SHIPROCKET');
      expect(trackingResult.currentStatus).toBe('PENDING_INTEGRATION');

      const cancelResult = await provider.cancelReturnPickup('shp-123');
      expect(cancelResult).toBe(false);

      const updateResult = await provider.handleTrackingUpdate();
      expect(updateResult.status).toBe('PENDING_INTEGRATION');
    });
  });

  describe('Forward tracking (getShipmentTrackingByAwb)', () => {
    const activity = {
      date: '2026-08-12 10:00:00',
      status: 'X-ILL2F',
      activity: 'Bag received at facility',
      location: 'Pune_Hub (Maharashtra)',
      'sr-status': '18',
      'sr-status-label': 'IN TRANSIT',
    };

    const mockFetchSequence = (trackBody: any) => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'tkn' }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(trackBody) });
    };

    it('calls GET /courier/track/awb/{awb} and returns raw activities', async () => {
      mockFetchSequence({
        tracking_data: {
          shipment_track: [{ current_status: 'IN TRANSIT', edd: '2026-08-14' }],
          shipment_track_activities: [activity],
          track_url: 'https://shiprocket.co/tracking/AWB1',
        },
      });

      const res = await provider.getShipmentTrackingByAwb('AWB1');

      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
        'https://apiv2.shiprocket.in/v1/external/courier/track/awb/AWB1',
      );
      expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe('GET');
      expect(res.activities).toEqual([activity]);
      expect(res.currentStatus).toBe('IN TRANSIT');
    });

    it('handles the AWB-keyed response shape and empty tracking', async () => {
      mockFetchSequence({ AWB2: { tracking_data: { shipment_track_activities: [activity] } } });
      expect((await provider.getShipmentTrackingByAwb('AWB2')).activities).toHaveLength(1);

      provider.invalidateTokenCache();
      mockFetchSequence({ tracking_data: { track_status: 0, error: 'no activities' } });
      expect((await provider.getShipmentTrackingByAwb('AWB3')).activities).toEqual([]);
    });
  });
});
