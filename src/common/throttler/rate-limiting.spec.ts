import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerGuard,
  minutes,
  hours,
} from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { LruThrottlerStorage } from './lru-throttler-storage';

describe('Production LRU Rate-Limiting Hardening Suite', () => {
  let guard: AppThrottlerGuard;
  let storage: LruThrottlerStorage;
  let module: TestingModule;

  const createMockContext = (options: {
    userId?: string;
    jwtToken?: string;
    guestSessionId?: string;
    ip?: string;
    url?: string;
    handlerName?: string;
    className?: string;
  }): ExecutionContext => {
    const {
      userId,
      jwtToken,
      guestSessionId,
      ip = '192.168.1.100',
      url = '/api/v1/products',
      handlerName = 'getProducts',
      className = 'ProductsController',
    } = options;

    const headers: Record<string, string> = {};
    if (jwtToken) {
      headers['authorization'] = `Bearer ${jwtToken}`;
    }
    if (guestSessionId) {
      headers['x-guest-session-id'] = guestSessionId;
    }

    const req: any = {
      ip,
      url,
      originalUrl: url,
      headers,
      body: guestSessionId ? { guestSessionId } : {},
      query: {},
      params: {},
    };

    if (userId) {
      req.user = { id: userId };
    }

    const res: any = {
      header: jest.fn(),
      headers: {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getClass: () => ({ name: className }),
      getHandler: () => ({ name: handlerName }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    storage = new LruThrottlerStorage({ max: 50000 });
    module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            { name: 'default', ttl: minutes(1), limit: 120 },
            { name: 'products', ttl: minutes(1), limit: 60 },
            { name: 'search', ttl: minutes(1), limit: 30 },
            { name: 'search-suggestions', ttl: minutes(1), limit: 30 },
            { name: 'delivery-estimate', ttl: minutes(1), limit: 30 },
            { name: 'cart', ttl: minutes(1), limit: 120 },
            { name: 'guest-cart', ttl: minutes(1), limit: 20 },
            { name: 'wishlist', ttl: minutes(1), limit: 120 },
            { name: 'compare', ttl: minutes(1), limit: 120 },
            { name: 'orders', ttl: minutes(1), limit: 60 },
            { name: 'address-read', ttl: minutes(1), limit: 60 },
            { name: 'address-mutation', ttl: minutes(1), limit: 30 },
            { name: 'checkout', ttl: minutes(1), limit: 20 },
            { name: 'payment-create', ttl: minutes(1), limit: 20 },
            { name: 'payment-verify', ttl: minutes(1), limit: 30 },
            { name: 'reviews-helpful', ttl: minutes(1), limit: 20 },
            { name: 'otp-send-short', ttl: minutes(10), limit: 3 },
            { name: 'otp-send-long', ttl: hours(1), limit: 20 },
            { name: 'otp-verify', ttl: hours(1), limit: 20 },
          ],
          storage,
        }),
      ],
      providers: [
        Reflector,
        {
          provide: ThrottlerGuard,
          useClass: AppThrottlerGuard,
        },
      ],
    }).compile();

    await module.init();
    guard = module.get<AppThrottlerGuard>(ThrottlerGuard);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('1 to 4: LRU Storage Fundamentals', () => {
    it('1. First request increments counter to 1', async () => {
      const res = await storage.increment('test-user-1', 60000, 10, 0, 'default');
      expect(res.totalHits).toBe(1);
      expect(res.isBlocked).toBe(false);
      expect(res.timeToExpire).toBeGreaterThan(0);
    });

    it('2. Repeated requests increment correctly', async () => {
      await storage.increment('test-user-2', 60000, 10, 0, 'default');
      const res2 = await storage.increment('test-user-2', 60000, 10, 0, 'default');
      const res3 = await storage.increment('test-user-2', 60000, 10, 0, 'default');
      expect(res2.totalHits).toBe(2);
      expect(res3.totalHits).toBe(3);
      expect(res3.isBlocked).toBe(false);
    });

    it('3. Limit is enforced and marks record as blocked', async () => {
      const limit = 3;
      await storage.increment('test-user-3', 60000, limit, 0, 'default'); // 1
      await storage.increment('test-user-3', 60000, limit, 0, 'default'); // 2
      const res3 = await storage.increment('test-user-3', 60000, limit, 0, 'default'); // 3
      expect(res3.isBlocked).toBe(false);

      const res4 = await storage.increment('test-user-3', 60000, limit, 0, 'default'); // 4
      expect(res4.totalHits).toBe(4);
      expect(res4.isBlocked).toBe(true);
    });

    it('4. TTL expires correctly and resets window', async () => {
      const shortTtl = 50; // 50ms
      const res1 = await storage.increment('ttl-user', shortTtl, 10, 0, 'default');
      expect(res1.totalHits).toBe(1);

      await new Promise((r) => setTimeout(r, 70));

      const res2 = await storage.increment('ttl-user', shortTtl, 10, 0, 'default');
      expect(res2.totalHits).toBe(1);
    });
  });

  describe('5 to 7: Per-User and Multi-Route Isolation', () => {
    it('5 & 6. Different users have separate counters while same user shares counter', async () => {
      const userAContext = createMockContext({
        userId: 'user-aaa',
        url: '/api/v1/products',
        handlerName: 'getProducts',
        className: 'ProductsController',
      });

      const userBContext = createMockContext({
        userId: 'user-bbb',
        url: '/api/v1/products',
        handlerName: 'getProducts',
        className: 'ProductsController',
      });

      // User A makes 120 requests (their full quota)
      for (let i = 1; i <= 120; i++) {
        const allowed = await guard.canActivate(userAContext);
        expect(allowed).toBe(true);
      }

      // User A hits limit
      await expect(guard.canActivate(userAContext)).rejects.toThrow();

      // User B is completely unaffected and has their own independent counter
      const userBAllowed = await guard.canActivate(userBContext);
      expect(userBAllowed).toBe(true);
    });

    it('7. Different routes/throttler contexts do not accidentally share keys', async () => {
      const productsContext = createMockContext({
        userId: 'multi-route-user',
        url: '/api/v1/products',
        handlerName: 'getProducts',
        className: 'ProductsController',
      });

      const ordersContext = createMockContext({
        userId: 'multi-route-user',
        url: '/api/v1/orders',
        handlerName: 'getOrders',
        className: 'OrdersController',
      });

      // User consumes 60 requests on orders (orders limit is 60)
      for (let i = 1; i <= 60; i++) {
        await guard.canActivate(ordersContext);
      }
      await expect(guard.canActivate(ordersContext)).rejects.toThrow();

      // Same user can still freely make requests to products
      const productsAllowed = await guard.canActivate(productsContext);
      expect(productsAllowed).toBe(true);
    });
  });

  describe('8: Bounded LRU Size', () => {
    it('8. LRU has bounded size and evicts oldest items when max is reached', async () => {
      const tinyStorage = new LruThrottlerStorage({ max: 5 });

      for (let i = 1; i <= 8; i++) {
        await tinyStorage.increment(`user-${i}`, 60000, 10, 0, 'default');
      }

      expect(tinyStorage.size).toBeLessThanOrEqual(5);
      expect(tinyStorage.max).toBe(5);

      // Oldest key should have been evicted
      expect(tinyStorage.get('user-1', 'default')).toBeUndefined();
      // Most recent key should exist
      expect(tinyStorage.get('user-8', 'default')).toBeDefined();
    });
  });

  describe('9 & 10: Cryptographic JWT Identity Verification & Anti-Spoofing', () => {
    it('9. Authenticated request uses verified req.user.id', async () => {
      const authContext = createMockContext({
        userId: 'verified-customer-42',
        url: '/api/v1/products',
      });

      const tracker = await guard.getTracker(
        authContext.switchToHttp().getRequest(),
      );
      expect(tracker).toBe('user:verified-customer-42');
    });

    it('10. A forged/unverified Authorization JWT cannot choose another user rate-limit identity', async () => {
      // Craft an unverified token with sub="victim-user-999"
      const fakePayload = Buffer.from(
        JSON.stringify({ sub: 'victim-user-999', id: 'victim-user-999' }),
      ).toString('base64url');
      const forgedJwt = `eyJhbGciOiJIUzI1NiJ9.${fakePayload}.invalidSignature`;

      // Request has forged JWT header, but req.user is NOT populated (unverified)
      const forgedContext = createMockContext({
        jwtToken: forgedJwt,
        ip: '198.51.100.77',
        url: '/api/v1/products',
      });

      const tracker = await guard.getTracker(
        forgedContext.switchToHttp().getRequest(),
      );

      // Must NOT be 'user:victim-user-999'! Must safely fall back to IP
      expect(tracker).toBe('ip:198.51.100.77');
      expect(tracker).not.toContain('victim-user-999');
    });
  });

  describe('11: Guest & IP Rate Limiting', () => {
    it('11. Guest traffic uses compound session identity and enforces guest limits', async () => {
      const guestContext = createMockContext({
        guestSessionId: 'sess-abc-123',
        ip: '203.0.113.88',
        url: '/api/v1/products',
      });

      const tracker = await guard.getTracker(
        guestContext.switchToHttp().getRequest(),
      );
      expect(tracker).toBe('guest:sess-abc-123:203.0.113.88');

      // Guest is limited to 60 req/min on products
      for (let i = 1; i <= 60; i++) {
        await guard.canActivate(guestContext);
      }
      await expect(guard.canActivate(guestContext)).rejects.toThrow();
    });
  });

  describe('12 & 13: Webhook & Admin Route Exclusions', () => {
    it('12. Webhooks bypass rate limiting and are never throttled', async () => {
      const webhookContext = createMockContext({
        url: '/api/v1/payments/webhook',
        handlerName: 'handleWebhook',
        className: 'PaymentsController',
      });

      for (let i = 1; i <= 250; i++) {
        const allowed = await guard.canActivate(webhookContext);
        expect(allowed).toBe(true);
      }
    });

    it('13. Admin management routes bypass customer rate limiting', async () => {
      const adminContext = createMockContext({
        url: '/api/v1/admin/orders',
        handlerName: 'getOrders',
        className: 'AdminOrdersController',
      });

      for (let i = 1; i <= 250; i++) {
        const allowed = await guard.canActivate(adminContext);
        expect(allowed).toBe(true);
      }
    });
  });

  describe('Endpoint Policy Verification', () => {
    it('Delivery estimate allows 60 req/min for authenticated user', async () => {
      const deliveryContext = createMockContext({
        userId: 'shopper-de',
        url: '/api/v1/shipping/delivery-estimate',
        handlerName: 'getDeliveryEstimate',
        className: 'DeliveryEstimateController',
      });

      for (let i = 1; i <= 60; i++) {
        const allowed = await guard.canActivate(deliveryContext);
        expect(allowed).toBe(true);
      }
      await expect(guard.canActivate(deliveryContext)).rejects.toThrow();
    });

    it('Cart allows 120 req/min for authenticated user', async () => {
      const cartContext = createMockContext({
        userId: 'cart-shopper',
        url: '/api/v1/cart',
        handlerName: 'getCart',
        className: 'CartController',
      });

      for (let i = 1; i <= 120; i++) {
        await guard.canActivate(cartContext);
      }
      await expect(guard.canActivate(cartContext)).rejects.toThrow();
    });

    it('Checkout allows 20 req/min for authenticated user', async () => {
      const checkoutContext = createMockContext({
        userId: 'checkout-shopper',
        url: '/api/v1/checkout/place-order',
        handlerName: 'placeOrder',
        className: 'CheckoutController',
      });

      for (let i = 1; i <= 20; i++) {
        await guard.canActivate(checkoutContext);
      }
      await expect(guard.canActivate(checkoutContext)).rejects.toThrow();
    });

    it('Payments allows 20 req/min create and 30 req/min verify', async () => {
      const payCreateContext = createMockContext({
        userId: 'pay-shopper',
        url: '/api/v1/payments/create-order',
        handlerName: 'createPaymentOrder',
        className: 'PaymentsController',
      });

      for (let i = 1; i <= 20; i++) {
        await guard.canActivate(payCreateContext);
      }
      await expect(guard.canActivate(payCreateContext)).rejects.toThrow();

      const payVerifyContext = createMockContext({
        userId: 'pay-shopper',
        url: '/api/v1/payments/verify',
        handlerName: 'verifyPayment',
        className: 'PaymentsController',
      });

      for (let i = 1; i <= 30; i++) {
        await guard.canActivate(payVerifyContext);
      }
      await expect(guard.canActivate(payVerifyContext)).rejects.toThrow();
    });

    it('OTP sending preserves strict 3 req / 10 min IP limit', async () => {
      const otpContext = createMockContext({
        ip: '198.51.100.99',
        url: '/api/v1/auth/otp/send',
        handlerName: 'sendOtp',
        className: 'AuthController',
      });

      for (let i = 1; i <= 3; i++) {
        expect(await guard.canActivate(otpContext)).toBe(true);
      }
      await expect(guard.canActivate(otpContext)).rejects.toThrow();
    });
  });
});
