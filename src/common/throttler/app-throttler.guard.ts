import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

/** HTTP methods that only read state and therefore get a wider allowance. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Per-request memo for the resolved rate-limit identity. */
const TRACKER_CACHE_KEY = '__kickatThrottleTracker';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly appLogger = new Logger(AppThrottlerGuard.name);

  /**
   * Standalone verifier used only to resolve the rate-limit identity.
   *
   * NOTE: guards run in the order they were registered, and `@Auth()` is
   * applied *after* `@UseGuards(ThrottlerGuard)` on most controllers, so this
   * guard executes BEFORE JwtAuthGuard and `req.user` is still undefined here.
   * Verifying the access-token signature ourselves makes identity resolution
   * independent of guard ordering, without ever trusting an unverified payload.
   */
  private readonly jwt = new JwtService({});

  constructor(
    @InjectThrottlerOptions()
    protected readonly options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    protected readonly storageService: ThrottlerStorage,
    protected readonly reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Extracts client IP safely honoring proxy headers.
   */
  private extractClientIp(req: Record<string, any>): string {
    if (!req) return '127.0.0.1';

    const xForwardedFor = req.headers?.['x-forwarded-for'];
    if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
      const firstIp = xForwardedFor.split(',')[0].trim();
      if (firstIp) return firstIp;
    }

    const xRealIp = req.headers?.['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim()) {
      return xRealIp.trim();
    }

    if (typeof req.ip === 'string' && req.ip.trim()) {
      return req.ip.trim();
    }

    return (
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Cryptographically verifies the Bearer access token and returns its `sub`.
   *
   * SECURITY: the signature and expiry are both checked against
   * JWT_ACCESS_SECRET. A forged or expired token resolves to null so the
   * caller falls back to guest/IP tracking and can never borrow another
   * user's rate-limit bucket.
   */
  private verifiedUserIdFromToken(req: Record<string, any>): string | null {
    const authHeader = req?.headers?.authorization;
    if (typeof authHeader !== 'string') return null;

    const [scheme, token] = authHeader.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') return null;

    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return null;

    try {
      const payload = this.jwt.verify<{ sub?: string; type?: string }>(token, {
        secret,
      });
      // Admin tokens are excluded here; admin routes bypass customer throttling.
      if (payload?.type === 'admin') return null;
      return typeof payload?.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the primary rate limit identity:
   * 1. Authenticated customer -> "user:<userId>", from the JwtAuthGuard result
   *    when available, otherwise from our own signature verification.
   * 2. Guest with session -> "guest:<guestSessionId>:<ip>" (guest-session aware + IP protection)
   * 3. Anonymous traffic -> "ip:<clientIp>"
   *
   * SECURITY: never decode or trust an unverified Authorization JWT payload.
   */
  async getTracker(
    req: Record<string, any>,
    _context?: ExecutionContext,
  ): Promise<string> {
    // Several named throttlers run per request; resolve the identity once.
    if (req && typeof req[TRACKER_CACHE_KEY] === 'string') {
      return req[TRACKER_CACHE_KEY];
    }

    const tracker = this.resolveTracker(req);
    if (req) {
      req[TRACKER_CACHE_KEY] = tracker;
    }
    return tracker;
  }

  private resolveTracker(req: Record<string, any>): string {
    // 1a. Direct user from cryptographically verified JwtAuthGuard / Passport
    if (req?.user?.id) {
      return `user:${req.user.id}`;
    }

    // 1b. This guard ran before JwtAuthGuard: verify the token ourselves
    const verifiedUserId = this.verifiedUserIdFromToken(req);
    if (verifiedUserId) {
      return `user:${verifiedUserId}`;
    }

    // 2. Guest session identity
    const guestSessionId =
      req?.body?.guestSessionId ||
      req?.query?.guestSessionId ||
      req?.params?.guestSessionId ||
      req?.params?.sessionId ||
      req?.headers?.['x-guest-session-id'];

    const ip = this.extractClientIp(req);

    if (
      guestSessionId &&
      typeof guestSessionId === 'string' &&
      guestSessionId.trim()
    ) {
      return `guest:${guestSessionId.trim()}:${ip}`;
    }

    // 3. IP fallback for anonymous users
    return `ip:${ip}`;
  }

  /**
   * Identifies routes that should NEVER be rate-limited by customer throttling:
   * - Webhooks (Razorpay / Shiprocket)
   * - Admin management routes
   */
  private shouldSkipRoute(
    req: Record<string, any>,
    context: ExecutionContext,
  ): boolean {
    const path = this.extractPath(req);
    const className = context.getClass()?.name?.toLowerCase() || '';

    // Webhooks should never be throttled
    if (path.includes('/webhook')) {
      return true;
    }

    // Admin panel routes should never be throttled by customer rate limits
    if (path.includes('/admin/') || className.includes('admin')) {
      return true;
    }

    return false;
  }

  /**
   * Returns the request path without the query string, so that a user-supplied
   * query value (e.g. `?q=/cart`) can never make a route match a foreign
   * throttler domain.
   */
  private extractPath(req: Record<string, any>): string {
    const raw: string = req?.originalUrl || req?.url || '';
    const queryStart = raw.indexOf('?');
    return queryStart === -1 ? raw : raw.slice(0, queryStart);
  }

  /**
   * Returns the name of the single throttler that owns this route, or null
   * when the route has no dedicated one and should fall back to 'default'.
   *
   * Exactly one throttler must own a route. Previously every named throttler
   * was tested independently and 'default' matched everything that did not
   * match a more specific name, so a route like GET /orders was charged
   * against BOTH the 'orders' bucket and the 120/min 'default' bucket - the
   * lower of the two silently became the real ceiling.
   */
  private resolveRouteThrottler(url: string, isRead: boolean): string | null {
    if (url.includes('/otp') || url.includes('/verification')) {
      // OTP routes are governed by the three otp-* throttlers together.
      return 'otp';
    }

    if (url.includes('/cart/guest')) return 'guest-cart';
    if (url.includes('/cart')) return 'cart';
    if (
      url.includes('/shipping/delivery-estimate') ||
      url.includes('/delivery-estimate')
    ) {
      return 'delivery-estimate';
    }
    if (url.includes('/search')) {
      return url.includes('/suggestions') ? 'search-suggestions' : 'search';
    }
    if (url.includes('/products')) return 'products';
    if (url.includes('/wishlist')) return 'wishlist';
    if (url.includes('/orders')) return 'orders';
    if (url.includes('/checkout')) return 'checkout';
    if (
      url.includes('/payments/create-order') ||
      url.includes('/payments/retry') ||
      url.includes('/payments/cod/confirm')
    ) {
      return 'payment-create';
    }
    if (url.includes('/payments/verify')) return 'payment-verify';
    if (url.includes('/reviews') && url.includes('/helpful')) {
      return 'reviews-helpful';
    }
    // Reads and mutations on the same resource must not share a bucket, or the
    // tighter mutation limit would also cap plain GETs.
    if (url.includes('/profile') || url.includes('/addresses')) {
      return isRead ? 'address-read' : 'address-mutation';
    }

    return null;
  }

  /**
   * Matches named throttlers to their respective route domains so that a
   * request is only charged against the one throttler that owns its route.
   */
  private isThrottlerApplicable(
    throttlerName: string | undefined,
    url: string,
    _className: string,
    isRead = false,
  ): boolean {
    const name = throttlerName || 'default';
    const owner = this.resolveRouteThrottler(url, isRead);

    // All three otp-* windows apply together on OTP routes, and nothing else does.
    if (owner === 'otp') {
      return name.startsWith('otp-');
    }
    if (name.startsWith('otp-')) {
      return false;
    }

    return name === (owner ?? 'default');
  }

  /**
   * Adapts the configured limit to the caller's identity and to whether the
   * request only reads state. Read-heavy pages (order history, wishlist) fan
   * out into many parallel GETs per render, so they get a wider allowance than
   * the mutations on the same resource.
   */
  private resolveEffectiveLimit(
    throttlerName: string | undefined,
    configuredLimit: number,
    isAuthUser: boolean,
    isRead: boolean,
  ): number {
    switch (throttlerName) {
      case 'products':
        return isAuthUser ? 120 : 60;
      case 'search':
        return isAuthUser ? 60 : 30;
      case 'search-suggestions':
        return isAuthUser ? 120 : 30;
      case 'delivery-estimate':
        return isAuthUser ? 60 : 30;
      case 'cart':
        return isAuthUser ? 120 : 20;
      case 'orders':
        // Order history / detail / tracking reads
        if (isRead) return isAuthUser ? 240 : 60;
        return configuredLimit;
      case 'wishlist':
        if (isRead) return isAuthUser ? 240 : 60;
        return configuredLimit;
      default:
        return configuredLimit;
    }
  }

  /**
   * Adapts the limit based on whether the customer is authenticated or guest.
   */
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    const { req } = this.getRequestResponse(context);

    if (this.shouldSkipRoute(req, context)) {
      return true;
    }

    const path = this.extractPath(req);
    const className = context.getClass()?.name?.toLowerCase() || '';
    const method = (req?.method || 'GET').toUpperCase();
    const isRead = READ_METHODS.has(method);

    // Route-domain matching
    if (!this.isThrottlerApplicable(throttler.name, path, className, isRead)) {
      return true;
    }

    const tracker = await this.getTracker(req, context);
    const isAuthUser = tracker.startsWith('user:');

    const effectiveLimit = this.resolveEffectiveLimit(
      throttler.name,
      requestProps.limit,
      isAuthUser,
      isRead,
    );

    return super.handleRequest({
      ...requestProps,
      limit: effectiveLimit,
      getTracker: async () => tracker,
    });
  }

  /**
   * Replaces the opaque "ThrottlerException: Too Many Requests" body with a
   * message that tells the client how long to back off, and logs which
   * throttler tripped so a 429 can be diagnosed from the server logs.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context);
    const retryAfter = Math.max(
      1,
      detail.timeToBlockExpire || detail.timeToExpire || 1,
    );

    this.appLogger.warn(
      `[429] ${req?.method} ${this.extractPath(req)} ` +
        `tracker=${detail.tracker} hits=${detail.totalHits}/${detail.limit} ` +
        `retryAfter=${retryAfter}s`,
    );

    res?.header?.('Retry-After', String(retryAfter));

    throw new HttpException(
      {
        message: `Too many requests. Please retry after ${retryAfter} second${
          retryAfter === 1 ? '' : 's'
        }.`,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
