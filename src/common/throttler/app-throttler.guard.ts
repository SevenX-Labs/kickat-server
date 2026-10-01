import {
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly appLogger = new Logger(AppThrottlerGuard.name);

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
   * Resolves the primary rate limit identity:
   * 1. Authenticated customer -> "user:<userId>" ONLY when req.user.id is
   *    populated by the cryptographic JwtAuthGuard verification.
   * 2. Guest with session -> "guest:<guestSessionId>:<ip>" (guest-session aware + IP protection)
   * 3. Anonymous traffic -> "ip:<clientIp>"
   *
   * SECURITY: Never decode or trust an unverified Authorization JWT token payload directly.
   */
  async getTracker(
    req: Record<string, any>,
    _context?: ExecutionContext,
  ): Promise<string> {
    // 1. Direct user from cryptographically verified JwtAuthGuard / Passport
    if (req?.user?.id) {
      return `user:${req.user.id}`;
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
    const url = req?.originalUrl || req?.url || '';
    const className = context.getClass()?.name?.toLowerCase() || '';

    // Webhooks should never be throttled
    if (url.includes('/webhook')) {
      return true;
    }

    // Admin panel routes should never be throttled by customer rate limits
    if (url.includes('/admin/') || className.includes('admin')) {
      return true;
    }

    return false;
  }

  /**
   * Matches named throttlers to their respective route domains to prevent
   * tight OTP throttlers from incorrectly tripping on product/cart routes.
   */
  private isThrottlerApplicable(
    throttlerName: string | undefined,
    url: string,
    _className: string,
  ): boolean {
    const name = throttlerName || 'default';
    const isOtpThrottler = name.startsWith('otp-');
    const isOtpRoute = url.includes('/otp') || url.includes('/verification');

    if (isOtpThrottler) {
      return isOtpRoute;
    }

    if (isOtpRoute) {
      return false;
    }

    // Route-specific throttlers
    if (name === 'products') return url.includes('/products');
    if (name === 'search') return url.includes('/search') && !url.includes('/suggestions');
    if (name === 'search-suggestions') return url.includes('/search') && url.includes('/suggestions');
    if (name === 'delivery-estimate') {
      return url.includes('/shipping/delivery-estimate') || url.includes('/delivery-estimate');
    }
    if (name === 'cart') return url.includes('/cart') && !url.includes('/cart/guest');
    if (name === 'guest-cart') return url.includes('/cart/guest');
    if (name === 'wishlist') return url.includes('/wishlist');
    if (name === 'orders') return url.includes('/orders');
    if (name === 'checkout') return url.includes('/checkout');
    if (name === 'payment-create') {
      return (
        url.includes('/payments/create-order') ||
        url.includes('/payments/retry') ||
        url.includes('/payments/cod/confirm')
      );
    }
    if (name === 'payment-verify') return url.includes('/payments/verify');
    if (name === 'address-read') return url.includes('/profile') || url.includes('/addresses');
    if (name === 'address-mutation') return url.includes('/profile') || url.includes('/addresses');
    if (name === 'reviews-helpful') return url.includes('/reviews') && url.includes('/helpful');

    return true;
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

    const url = req?.originalUrl || req?.url || '';
    const className = context.getClass()?.name?.toLowerCase() || '';

    // Route-domain matching
    if (!this.isThrottlerApplicable(throttler.name, url, className)) {
      return true;
    }

    const tracker = await this.getTracker(req, context);
    const isAuthUser = tracker.startsWith('user:');

    // Adapt limit if route has different limits for authenticated user vs guest
    let effectiveLimit = requestProps.limit;

    if (throttler.name === 'products') {
      effectiveLimit = isAuthUser ? 120 : 60;
    } else if (throttler.name === 'search') {
      effectiveLimit = isAuthUser ? 60 : 30;
    } else if (throttler.name === 'search-suggestions') {
      effectiveLimit = isAuthUser ? 120 : 30;
    } else if (throttler.name === 'delivery-estimate') {
      effectiveLimit = isAuthUser ? 60 : 30;
    } else if (throttler.name === 'cart') {
      effectiveLimit = isAuthUser ? 120 : 20;
    }

    return super.handleRequest({
      ...requestProps,
      limit: effectiveLimit,
      getTracker: async () => tracker,
    });
  }
}
