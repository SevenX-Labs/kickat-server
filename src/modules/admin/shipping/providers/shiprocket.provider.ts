import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateReturnPickupParams,
  ReturnPickupResult,
  ReturnStatusUpdate,
  ReturnTrackingResult,
  ShippingProvider,
} from './shipping-provider.interface';

export interface ShiprocketServiceabilityParams {
  pickupPostcode: string;
  deliveryPostcode: string;
  weight: number;
  cod: boolean;
}

interface ShiprocketLoginResponse {
  token?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

interface ShiprocketErrorResponse {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

interface JwtPayload {
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

@Injectable()
export class ShiprocketProvider implements ShippingProvider {
  readonly providerName = 'SHIPROCKET';
  private readonly logger = new Logger(ShiprocketProvider.name);
  private readonly baseUrl = 'https://apiv2.shiprocket.in/v1/external';
  private readonly defaultTimeoutMs = 15000;
  private readonly expiryBufferMs = 30 * 60 * 1000; // 30 minutes buffer before expiration

  private cachedToken: string | null = null;
  private tokenExpiresAt: number | null = null; // epoch ms
  private authPromise: Promise<string> | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if Shiprocket credentials are fully configured in the environment
   */
  isConfigured(): boolean {
    const email = (
      this.configService.get<string>('SHIPROCKET_EMAIL', '') || ''
    ).trim();
    const password = (
      this.configService.get<string>('SHIPROCKET_PASSWORD', '') || ''
    ).trim();
    return Boolean(email && password);
  }

  /**
   * Safely retrieve credentials from ConfigService or throw clear error
   */
  private getCredentials(): { email: string; password: string } {
    const email = (
      this.configService.get<string>('SHIPROCKET_EMAIL', '') || ''
    ).trim();
    const password = (
      this.configService.get<string>('SHIPROCKET_PASSWORD', '') || ''
    ).trim();

    if (!email || !password) {
      throw new Error(
        'Shiprocket credentials missing: SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD must be set in environment variables.',
      );
    }

    return { email, password };
  }

  /**
   * Authenticates with Shiprocket API with concurrent in-flight deduplication
   */
  async authenticate(): Promise<string> {
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = this.performLogin().finally(() => {
      this.authPromise = null;
    });

    return this.authPromise;
  }

  /**
   * Internal login execution: posts credentials to /auth/login and caches token
   */
  private async performLogin(): Promise<string> {
    const { email, password } = this.getCredentials();

    const loginUrl = `${this.baseUrl}/auth/login`;

    let response: Response;
    try {
      response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'KickAt-Server/1.0',
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(this.defaultTimeoutMs),
      });
    } catch (networkErr: unknown) {
      const isTimeout =
        networkErr instanceof Error && networkErr.name === 'TimeoutError';
      const msg = isTimeout
        ? 'Shiprocket authentication request timed out'
        : 'Shiprocket authentication network error';
      const detail =
        networkErr instanceof Error ? networkErr.message : String(networkErr);
      this.logger.error(`${msg}: ${detail}`);
      throw new Error(msg);
    }

    if (!response.ok) {
      let safeError = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson =
          (await response.json()) as Partial<ShiprocketErrorResponse>;
        if (errorJson && typeof errorJson === 'object') {
          safeError = errorJson.message || errorJson.error || safeError;
        }
      } catch {
        // Response body not JSON
      }
      this.logger.error(`Shiprocket authentication failed: ${safeError}`);
      throw new Error(`Shiprocket authentication failed: ${safeError}`);
    }

    const resJson = (await response.json()) as ShiprocketLoginResponse;
    const token = resJson?.token;

    if (!token || typeof token !== 'string') {
      this.logger.error(
        'Shiprocket login response missing authentication token',
      );
      throw new Error('Shiprocket login response missing token');
    }

    // Decode JWT expiration claim if available, default to 10 days
    let expiresAtMs = Date.now() + 10 * 24 * 60 * 60 * 1000;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson) as JwtPayload;
        if (typeof payload.exp === 'number') {
          expiresAtMs = payload.exp * 1000;
        }
      }
    } catch {
      // Fall back to default 10-day expiration
    }

    this.cachedToken = token;
    this.tokenExpiresAt = expiresAtMs;

    this.logger.log(
      'Shiprocket authentication succeeded; token cached in memory.',
    );
    return token;
  }

  /**
   * Retrieves active token from memory cache or refreshes if expired/near-expiry
   */
  async getValidToken(): Promise<string> {
    const now = Date.now();
    const isValid =
      this.cachedToken !== null &&
      this.tokenExpiresAt !== null &&
      this.tokenExpiresAt - now > this.expiryBufferMs;

    if (isValid && this.cachedToken) {
      return this.cachedToken;
    }

    return this.authenticate();
  }

  /**
   * Make an authenticated HTTP request to Shiprocket API with 401 retry-once handling
   */
  async requestWithAuth<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<T> {
    const token = await this.getValidToken();

    const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${normalizedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'KickAt-Server/1.0',
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || AbortSignal.timeout(this.defaultTimeoutMs),
      });
    } catch (networkErr: unknown) {
      const isTimeout =
        networkErr instanceof Error && networkErr.name === 'TimeoutError';
      const msg = isTimeout
        ? `Shiprocket API request to ${normalizedPath} timed out`
        : `Shiprocket API network error on ${normalizedPath}`;
      const detail =
        networkErr instanceof Error ? networkErr.message : String(networkErr);
      this.logger.error(`${msg}: ${detail}`);
      throw new Error(msg);
    }

    // 401 Unauthorized handling: invalidate cache and retry ONCE
    if (response.status === 401) {
      if (!isRetry) {
        this.logger.warn(
          `Shiprocket API returned 401 on ${normalizedPath}. Invalidating token cache and retrying once...`,
        );
        this.invalidateTokenCache();
        return this.requestWithAuth<T>(endpoint, options, true);
      }
      this.logger.error(
        `Shiprocket API 401 Unauthorized persisted after token refresh on ${normalizedPath}.`,
      );
      throw new Error(
        `Shiprocket API unauthorized (401) on ${normalizedPath} after token refresh retry.`,
      );
    }

    if (!response.ok) {
      let safeError = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson =
          (await response.json()) as Partial<ShiprocketErrorResponse>;
        if (errorJson && typeof errorJson === 'object') {
          safeError = errorJson.message || errorJson.error || safeError;
        }
      } catch {
        // Ignore JSON parse failure on error body
      }
      this.logger.error(
        `Shiprocket API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
      throw new Error(
        `Shiprocket API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Courier serviceability query
   */
  async checkServiceability<T = unknown>(
    params: ShiprocketServiceabilityParams,
  ): Promise<T> {
    const query = new URLSearchParams({
      pickup_postcode: params.pickupPostcode,
      delivery_postcode: params.deliveryPostcode,
      weight: params.weight.toString(),
      cod: params.cod ? '1' : '0',
    });

    return this.requestWithAuth<T>(
      `/courier/serviceability/?${query.toString()}`,
      {
        method: 'GET',
      },
    );
  }

  // --- ShippingProvider Interface Implementations (Deferred to subsequent tasks) ---

  createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult> {
    this.logger.warn(
      `Shiprocket forward/return pickup is not yet enabled in this phase for returnId=${params.returnId}, orderId=${params.orderId}.`,
    );
    return Promise.resolve({
      isConfigured: this.isConfigured(),
      providerName: this.providerName,
      pickupId: null,
      awbNumber: null,
      courierPartner: null,
      trackingUrl: null,
      pickupDate: null,
      status: 'PENDING_INTEGRATION',
      message:
        'Shiprocket provider authentication ready; shipment creation pipeline is scheduled for the next phase.',
    });
  }

  getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult> {
    return Promise.resolve({
      isConfigured: this.isConfigured(),
      providerName: this.providerName,
      shipmentId,
      currentStatus: 'PENDING_INTEGRATION',
      checkpoints: [
        {
          status: 'PENDING_INTEGRATION',
          timestamp: new Date().toISOString(),
          description:
            'Shiprocket tracking pipeline is scheduled for subsequent phase.',
        },
      ],
    });
  }

  cancelReturnPickup(_shipmentId: string): Promise<boolean> {
    this.logger.warn(
      `Shiprocket cancelReturnPickup not yet implemented for shipment ${_shipmentId}.`,
    );
    return Promise.resolve(false);
  }

  handleTrackingUpdate(): Promise<ReturnStatusUpdate> {
    return Promise.resolve({
      status: 'PENDING_INTEGRATION',
      notes:
        'Shiprocket webhook tracking update scheduled for subsequent phase.',
    });
  }

  // --- Helpers for Diagnostics & Unit Testing ---

  hasCachedToken(): boolean {
    return this.cachedToken !== null;
  }

  getTokenExpiresAt(): number | null {
    return this.tokenExpiresAt;
  }

  invalidateTokenCache(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = null;
  }
}
