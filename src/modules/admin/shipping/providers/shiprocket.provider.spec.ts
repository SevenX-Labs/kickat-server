import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ShiprocketProvider } from './shiprocket.provider';
import { NullShippingProvider } from './null-shipping.provider';
import { Logger } from '@nestjs/common';

describe('ShiprocketProvider', () => {
  let provider: ShiprocketProvider;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;

  const mockConfig: Record<string, string> = {
    SHIPROCKET_EMAIL: 'api-user@example.com',
    SHIPROCKET_PASSWORD: 'securePassword123!',
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

      // Initial login returns expired token
      await provider.authenticate();

      // getValidToken notices expired timestamp and logs in again
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

      // Login sets near-expiry token
      await provider.authenticate();

      // getValidToken proactively refreshes
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

      // Trigger multiple concurrent requests simultaneously
      const reqA = provider.getValidToken();
      const reqB = provider.getValidToken();
      const reqC = provider.getValidToken();

      resolveAuth!(true);

      const [resA, resB, resC] = await Promise.all([reqA, reqB, reqC]);

      expect(resA).toBe(freshToken);
      expect(resB).toBe(freshToken);
      expect(resC).toBe(freshToken);
      // Only 1 login request dispatched
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authenticated Requests & 401 Retry Handling', () => {
    it('7. Shiprocket HTTP 401 invalidates cache, refreshes token and retries request once', async () => {
      const token1 = createMockJwt(864000);
      const token2 = createMockJwt(864000);

      global.fetch = jest
        .fn()
        // Step 1: Initial login
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token1 }),
        })
        // Step 2: API request returns 401 Unauthorized
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Token Expired' }),
        })
        // Step 3: Re-authentication login
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token2 }),
        })
        // Step 4: Retried API request succeeds with 200
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

    it('8. Second consecutive 401 fails safely without infinite retry', async () => {
      const token1 = createMockJwt(864000);
      const token2 = createMockJwt(864000);

      global.fetch = jest
        .fn()
        // Initial login
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token1 }),
        })
        // First API call -> 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Invalid Token' }),
        })
        // Re-login
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: token2 }),
        })
        // Second API call -> 401 again
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

      // Exactly 4 calls: login -> req -> re-login -> retry-req (NO 5th call)
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('9. Shiprocket 4xx error converts to safe backend error', async () => {
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
            Promise.resolve({ message: 'Invalid delivery postcode provided' }),
        });

      await expect(
        provider.checkServiceability({
          pickupPostcode: '000000',
          deliveryPostcode: '999999',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow(
        /Shiprocket API error \[422\].*Invalid delivery postcode/,
      );
    });

    it('10. Shiprocket 5xx error converts to safe backend error', async () => {
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
          status: 502,
          statusText: 'Bad Gateway',
          json: () =>
            Promise.resolve({ message: 'Service Temporarily Unavailable' }),
        });

      await expect(
        provider.checkServiceability({
          pickupPostcode: '110001',
          deliveryPostcode: '560001',
          weight: 0.5,
          cod: false,
        }),
      ).rejects.toThrow(/Shiprocket API error \[502\]/);
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
});
