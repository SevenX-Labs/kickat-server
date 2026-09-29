import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateReturnPickupParams,
  CreateShipmentParams,
  CreateShipmentResult,
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

export interface ShiprocketOrderItemPayload {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: number | string;
}

export interface ShiprocketCreateOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  channel_id?: string;
  comment?: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  shipping_customer_name?: string;
  shipping_last_name?: string;
  shipping_address?: string;
  shipping_address_2?: string;
  shipping_city?: string;
  shipping_pincode?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_email?: string;
  shipping_phone?: string;
  order_items: ShiprocketOrderItemPayload[];
  payment_method: 'COD' | 'Prepaid';
  shipping_charges?: number;
  giftwrap_charges?: number;
  transaction_charges?: number;
  total_discount?: number;
  sub_total: number;
  length?: number;
  breadth?: number;
  height?: number;
  weight: number;
}

export interface ShiprocketCreateOrderResponse {
  order_id?: number | string;
  shipment_id?: number | string;
  status?: string;
  status_code?: number;
  onboarding_completed_now?: number;
  awb_code?: string;
  courier_company_id?: string | number;
  courier_name?: string;
  message?: string;
  [key: string]: unknown;
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
   * Creates a forward shipment in Shiprocket via POST /orders/create/adhoc
   * Validates all required fields strictly without silent fallbacks.
   */
  async createShipment(
    params: CreateShipmentParams,
  ): Promise<CreateShipmentResult> {
    // 1. Pickup location validation (no hardcoded fallback)
    const pickupLocation = (
      params.pickupLocation ||
      this.configService.get<string>('SHIPROCKET_PICKUP_LOCATION', '') ||
      ''
    ).trim();

    if (!pickupLocation) {
      throw new Error(
        'Shiprocket pickup location is not configured. Configure SHIPROCKET_PICKUP_LOCATION in environment or pass pickupLocation in params.',
      );
    }

    // 2. Customer Email validation (no fake fallback like customer@kickat.in)
    const customerEmail = (params.customer.email || '').trim();
    if (!customerEmail || !EMAIL_REGEX.test(customerEmail)) {
      throw new Error(
        'Valid customer email is required for Shiprocket shipment creation.',
      );
    }

    // 3. Customer Name validation
    const rawName = (
      params.customer.name ||
      params.shippingAddress.name ||
      ''
    ).trim();
    if (!rawName) {
      throw new Error(
        'Customer name is required for Shiprocket shipment creation.',
      );
    }

    // 4. Phone Number normalization & validation
    const rawPhone = (
      params.customer.phone ||
      params.shippingAddress.phone ||
      ''
    ).trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phone =
      cleanPhone.length === 12 && cleanPhone.startsWith('91')
        ? cleanPhone.slice(2)
        : cleanPhone;

    if (!phone || phone.length < 10) {
      throw new Error(
        'Valid customer phone number (minimum 10 digits) is required for Shiprocket shipment creation.',
      );
    }

    // 5. Shipping Address validation
    const houseFlat = params.shippingAddress.houseFlat?.trim();
    const buildingStreet = params.shippingAddress.buildingStreet?.trim();
    if (!houseFlat && !buildingStreet) {
      throw new Error(
        'Shipping address line is required for Shiprocket shipment creation.',
      );
    }

    const city = params.shippingAddress.city?.trim();
    const state = params.shippingAddress.state?.trim();
    const pincode = params.shippingAddress.pincode?.trim();
    if (!city || !state || !pincode) {
      throw new Error(
        'Shipping city, state, and pincode are required for Shiprocket shipment creation.',
      );
    }

    // 6. Order Items validation
    if (!params.items || params.items.length === 0) {
      throw new Error(
        'At least one order item is required for Shiprocket shipment creation.',
      );
    }

    // 7. Package Weight validation (no silent 0.5 kg fallback)
    const weight = params.packageDetails?.weight;
    if (typeof weight !== 'number' || isNaN(weight) || weight <= 0) {
      throw new Error(
        'Shipment weight is required before creating a Shiprocket shipment.',
      );
    }

    // 8. Package Dimensions validation (no silent 10x10x10 fallback)
    let length: number | undefined;
    let breadth: number | undefined;
    let height: number | undefined;

    if (
      params.packageDetails?.length !== undefined ||
      params.packageDetails?.breadth !== undefined ||
      params.packageDetails?.height !== undefined
    ) {
      const l = params.packageDetails.length;
      const b = params.packageDetails.breadth;
      const h = params.packageDetails.height;

      if (
        typeof l !== 'number' ||
        typeof b !== 'number' ||
        typeof h !== 'number' ||
        l <= 0 ||
        b <= 0 ||
        h <= 0
      ) {
        throw new Error(
          'Package dimensions (length, breadth, height) must be positive numbers when provided.',
        );
      }
      length = l;
      breadth = b;
      height = h;
    }

    // 9. Customer name splitting
    const nameParts = rawName.split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 10. Address line assembly
    const billingAddress = houseFlat || buildingStreet || 'Address Line 1';
    const address2Parts = [
      houseFlat && buildingStreet ? buildingStreet : null,
      params.shippingAddress.landmark?.trim() || null,
    ].filter(Boolean);
    const billingAddress2 = address2Parts.join(', ');

    // 11. Payment method mapping
    const isCod = params.paymentMethod?.toUpperCase() === 'COD';
    const paymentMethod: 'COD' | 'Prepaid' = isCod ? 'COD' : 'Prepaid';

    // 12. Order items mapping
    const orderItems: ShiprocketOrderItemPayload[] = params.items.map(
      (item) => ({
        name: item.variantName
          ? `${item.productName} (${item.variantName})`
          : item.productName,
        sku: (item.sku || item.productId || 'SKU-ITEM').trim(),
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
      }),
    );

    // 13. Date formatting (YYYY-MM-DD HH:mm)
    const rawDate = params.orderDate ? new Date(params.orderDate) : new Date();
    const orderDate = rawDate.toISOString().slice(0, 16).replace('T', ' ');

    const payload: ShiprocketCreateOrderPayload = {
      order_id: params.orderNumber,
      order_date: orderDate,
      pickup_location: pickupLocation,
      billing_customer_name: firstName,
      billing_last_name: lastName,
      billing_address: billingAddress,
      billing_address_2: billingAddress2 || undefined,
      billing_city: city,
      billing_pincode: pincode,
      billing_state: state,
      billing_country: params.shippingAddress.country || 'India',
      billing_email: customerEmail,
      billing_phone: phone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: paymentMethod,
      shipping_charges: params.deliveryFee || 0,
      total_discount: params.discount || 0,
      sub_total: params.subtotal,
      ...(length !== undefined && { length }),
      ...(breadth !== undefined && { breadth }),
      ...(height !== undefined && { height }),
      weight,
    };

    this.logger.log(
      `Dispatching Shiprocket forward shipment creation for order ${params.orderNumber} (pickup_location: ${pickupLocation}, weight: ${weight}kg, payment_method: ${paymentMethod}).`,
    );

    const res = await this.requestWithAuth<ShiprocketCreateOrderResponse>(
      '/orders/create/adhoc',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    const orderId = res.order_id != null ? String(res.order_id) : null;
    const shipmentId =
      res.shipment_id != null ? String(res.shipment_id) : null;

    this.logger.log(
      `Shiprocket order created successfully for ${params.orderNumber}: order_id=${orderId}, shipment_id=${shipmentId}, status=${res.status || 'NEW'}.`,
    );

    return {
      isConfigured: true,
      providerName: this.providerName,
      orderId,
      shipmentId,
      status: res.status || 'NEW',
      statusCode:
        typeof res.status_code === 'number' ? res.status_code : null,
      awbCode: res.awb_code || null,
      courierName: res.courier_name || null,
      message: 'Shiprocket forward shipment created successfully',
    };
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

  cancelReturnPickup(_shipmentId?: string): Promise<boolean> {
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
