import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignAwbParams,
  AssignAwbResult,
  AvailableCourier,
  CreateReturnPickupParams,
  CreateShipmentParams,
  CreateShipmentResult,
  ReturnPickupResult,
  ReturnStatusUpdate,
  ReturnTrackingResult,
  ServiceabilityQueryParams,
  ShipmentTrackingResult,
  ShippingProvider,
} from './shipping-provider.interface';

export interface EkartAuthResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
}

export interface EkartCreateShipmentResponse {
  status: boolean;
  remark: string;
  tracking_id: string;
  vendor: string;
  barcodes?: {
    wbn?: string;
    order?: string;
    cod?: string;
  };
}

export interface EkartTrackResponse {
  _id?: string;
  track?: {
    status?: string;
    ctime?: number;
    pickupTime?: number;
    desc?: string;
    location?: string;
    ndrStatus?: string;
    attempts?: number;
    ndrActions?: string[];
    details?: Array<{
      status?: string;
      ctime?: number;
      desc?: string;
      location?: string;
    }>;
  };
  edd?: number;
  order_number?: string;
}

export interface EkartServiceabilityResponse {
  tat?: { min?: number; max?: number };
  courierGroup?: string;
  forwardDeliveredCharges?: {
    totalForwardDeliveredEstimate?: string | number;
    [key: string]: unknown;
  };
  rtoDeliveredCharges?: Record<string, unknown>;
  reverseDeliveredCharges?: Record<string, unknown>;
}

const PHONE_REGEX = /^[6-9]\d{9}$/;

@Injectable()
export class EkartProvider implements ShippingProvider {
  readonly providerName = 'EKART';
  private readonly logger = new Logger(EkartProvider.name);
  private readonly defaultTimeoutMs = 15000;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getClientId() && this.getUsername() && this.getPassword());
  }

  private getBaseUrl(): string {
    const raw = (
      this.configService.get<string>('EKART_BASE_URL', '') || ''
    ).trim();
    return raw ? raw.replace(/\/+$/, '') : 'https://app.elite.ekartlogistics.in';
  }

  private getClientId(): string {
    return (this.configService.get<string>('EKART_CLIENT_ID', '') || '').trim();
  }

  private getUsername(): string {
    return (this.configService.get<string>('EKART_USERNAME', '') || '').trim();
  }

  private getPassword(): string {
    return (this.configService.get<string>('EKART_PASSWORD', '') || '').trim();
  }

  private getPickupAlias(): string {
    return (
      this.configService.get<string>('EKART_PICKUP_ALIAS', 'BHIM ENTERPRISE') || 'BHIM ENTERPRISE'
    ).trim();
  }

  private getDefaultService(): 'SURFACE' | 'EXPRESS' {
    const svc = (
      this.configService.get<string>('EKART_DEFAULT_SERVICE', 'SURFACE') || 'SURFACE'
    ).trim().toUpperCase();
    return svc === 'EXPRESS' ? 'EXPRESS' : 'SURFACE';
  }

  private getSellerName(): string {
    return (this.configService.get<string>('EKART_SELLER_NAME', '') || '').trim();
  }

  private getSellerAddress(): string {
    return (this.configService.get<string>('EKART_SELLER_ADDRESS', '') || '').trim();
  }

  private getSellerGstin(): string {
    return (this.configService.get<string>('EKART_SELLER_GSTIN', '') || '').trim();
  }

  async getAuthToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const clientId = this.getClientId();
    const username = this.getUsername();
    const password = this.getPassword();

    if (!clientId || !username || !password) {
      throw new Error(
        'Ekart credentials missing: EKART_CLIENT_ID, EKART_USERNAME, and EKART_PASSWORD must be set.',
      );
    }

    const url = `${this.getBaseUrl()}/integrations/v2/auth/token/${encodeURIComponent(clientId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(this.defaultTimeoutMs),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Ekart auth request failed: ${msg}`);
      throw new Error(`Ekart auth request failed: ${msg}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(`Ekart auth error [${response.status}]: ${errText}`);
      throw new Error(`Ekart auth error [${response.status}]`);
    }

    const data = (await response.json()) as EkartAuthResponse;
    this.cachedToken = data.access_token;
    // Refresh 1 hour before expiry
    this.tokenExpiresAt = Date.now() + (data.expires_in - 3600) * 1000;

    return this.cachedToken;
  }

  private async requestWithAuth<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getAuthToken();
    const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.getBaseUrl()}${normalizedPath}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
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
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      const msg = isTimeout
        ? `Ekart API request to ${normalizedPath} timed out`
        : `Ekart API network error on ${normalizedPath}`;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`${msg}: ${detail}`);
      throw new Error(msg);
    }

    if (!response.ok) {
      let safeError = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = (await response.json()) as Record<string, unknown>;
        safeError =
          (errorJson.message as string) ||
          (errorJson.error as string) ||
          JSON.stringify(errorJson);
      } catch {
        // Body was not JSON
      }
      this.logger.error(
        `Ekart API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
      throw new Error(
        `Ekart API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
    }

    return (await response.json()) as T;
  }

  private async requestWithAuthRaw(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getAuthToken();
    const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.getBaseUrl()}${normalizedPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || AbortSignal.timeout(30000),
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Ekart API raw request error on ${normalizedPath}: ${detail}`);
      throw new Error(`Ekart API request failed on ${normalizedPath}`);
    }

    if (!response.ok) {
      this.logger.error(
        `Ekart API error [${response.status}] on ${normalizedPath}`,
      );
      throw new Error(`Ekart API error [${response.status}] on ${normalizedPath}`);
    }

    return response;
  }

  async checkServiceability(
    params: ServiceabilityQueryParams,
  ): Promise<{
    isServiceable: boolean;
    pincode: string;
    codAvailable: boolean;
    estimatedDeliveryDays?: number;
    estimatedDeliveryDate?: string;
    shippingCharge?: number;
    courierGroup?: string;
    raw: EkartServiceabilityResponse[];
  }> {
    const dropPincode = String(params.deliveryPostcode || '').trim();
    const pickupPincode = String(params.pickupPostcode || '').trim();

    if (!/^[1-9][0-9]{5}$/.test(dropPincode)) {
      return {
        isServiceable: false,
        pincode: dropPincode,
        codAvailable: false,
        raw: [],
      };
    }

    const weightGrams = Math.max(1, Math.round((params.weight || 0.5) * 1000));
    const isCod = params.cod !== false;

    const payload = {
      pickupPincode: pickupPincode || '721643',
      dropPincode,
      length: String(params.length || 10),
      height: String(params.height || 10),
      width: String(params.breadth || 10),
      weight: String(weightGrams),
      paymentType: isCod ? 'COD' : 'Prepaid',
      serviceType: this.getDefaultService(),
      invoiceAmount: '1000',
      ...(isCod ? { codAmount: '1000' } : {}),
    };

    const res = await this.requestWithAuth<EkartServiceabilityResponse[]>(
      '/data/v3/serviceability',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    if (!Array.isArray(res) || res.length === 0) {
      return {
        isServiceable: false,
        pincode: dropPincode,
        codAvailable: false,
        raw: [],
      };
    }

    const first = res[0];
    const tatMax = first.tat?.max ?? first.tat?.min;
    const tatMin = first.tat?.min;
    const estimatedDays = tatMax || tatMin;

    let estimatedDate: string | undefined;
    if (estimatedDays) {
      const d = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      estimatedDate = `${year}-${month}-${day}`;
    }

    const chargeStr = first.forwardDeliveredCharges?.totalForwardDeliveredEstimate;
    const shippingCharge = chargeStr ? parseFloat(String(chargeStr)) : undefined;

    return {
      isServiceable: true,
      pincode: dropPincode,
      codAvailable: isCod,
      estimatedDeliveryDays: estimatedDays,
      estimatedDeliveryDate: estimatedDate,
      shippingCharge: shippingCharge && !isNaN(shippingCharge) ? shippingCharge : undefined,
      courierGroup: first.courierGroup,
      raw: res,
    };
  }

  async getRecommendedCourier(
    params: ServiceabilityQueryParams,
  ): Promise<AvailableCourier | null> {
    try {
      const check = await this.checkServiceability(params);
      if (!check.isServiceable) return null;

      return {
        courierCompanyId: 'ekart',
        courierName: `Ekart ${this.getDefaultService()}`,
        rate: check.shippingCharge,
        etd: check.estimatedDeliveryDate,
        isRecommended: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Ekart serviceability check failed for pincode ${params.deliveryPostcode}: ${msg}`,
      );
      return null;
    }
  }

  async getPickupLocationPincode(
    _pickupLocationName: string,
  ): Promise<string | null> {
    const pincode = (
      this.configService.get<string>('EKART_PICKUP_PINCODE', '') || ''
    ).trim();
    return pincode && /^\d{6}$/.test(pincode) ? pincode : null;
  }

  async createShipment(
    params: CreateShipmentParams,
  ): Promise<CreateShipmentResult> {
    const sellerName = this.getSellerName();
    const sellerAddress = this.getSellerAddress();
    const sellerGstin = this.getSellerGstin();

    if (!sellerName || !sellerGstin) {
      throw new Error(
        'Ekart seller details missing: EKART_SELLER_NAME and EKART_SELLER_GSTIN must be set.',
      );
    }

    const rawName = (
      params.customer.name || params.shippingAddress.name || ''
    ).trim();
    if (!rawName) {
      throw new Error('Customer name is required for Ekart shipment creation.');
    }

    const rawPhone = (
      params.customer.phone || params.shippingAddress.phone || ''
    ).trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !PHONE_REGEX.test(cleanPhone)) {
      throw new Error(
        `Valid 10-digit Indian phone number required for Ekart shipment (received "${rawPhone}").`,
      );
    }

    const addr = params.shippingAddress;
    if (!addr.city || !addr.state || !addr.pincode) {
      throw new Error(
        'Incomplete shipping address: city, state, and pincode are required for Ekart.',
      );
    }

    const addressLine = [addr.houseFlat, addr.buildingStreet, addr.landmark]
      .filter(Boolean)
      .join(', ')
      .trim();
    if (!addressLine) {
      throw new Error('Street address is required for Ekart shipment creation.');
    }

    const isCod = params.paymentMethod?.toUpperCase() === 'COD';
    const totalAmount = params.grandTotal;
    const taxValue = params.taxAmount || 0;
    const taxableAmount = totalAmount - taxValue;
    const weightGrams = Math.max(1, Math.round((params.packageDetails?.weight || 0.5) * 1000));

    const productDesc = (params.items || [])
      .map((i) => `${i.productName} (x${i.quantity})`)
      .join(', ')
      .slice(0, 250) || 'KickAt Store Order';

    const totalQuantity = (params.items || []).reduce(
      (sum, i) => sum + (i.quantity || 1),
      0,
    );

    const invoiceDate = params.orderDate
      ? new Date(params.orderDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const payload = {
      seller_name: sellerName,
      seller_address: sellerAddress || sellerName,
      seller_gst_tin: sellerGstin,
      seller_gst_amount: 0,
      consignee_gst_amount: 0,
      order_number: params.orderNumber,
      invoice_number: params.orderNumber,
      invoice_date: invoiceDate,
      consignee_name: rawName,
      consignee_alternate_phone: cleanPhone,
      products_desc: productDesc,
      payment_mode: isCod ? 'COD' : 'Prepaid',
      category_of_goods: 'General Merchandise',
      total_amount: totalAmount,
      tax_value: taxValue,
      taxable_amount: taxableAmount > 0 ? taxableAmount : totalAmount,
      commodity_value: String(taxableAmount > 0 ? taxableAmount : totalAmount),
      cod_amount: isCod ? totalAmount : 0,
      quantity: totalQuantity || 1,
      weight: weightGrams,
      length: params.packageDetails?.length || 10,
      height: params.packageDetails?.height || 10,
      width: params.packageDetails?.breadth || 10,
      return_reason: '',
      drop_location: {
        name: rawName,
        phone: Number(cleanPhone),
        address: addressLine,
        city: addr.city,
        state: addr.state,
        country: 'India',
        pin: Number(addr.pincode),
      },
      pickup_location: { name: this.getPickupAlias() },
      return_location: { name: this.getPickupAlias() },
      service: this.getDefaultService(),
    };

    this.logger.log(
      `Creating Ekart shipment for order ${params.orderNumber} (weight=${weightGrams}g, cod=${isCod}).`,
    );

    const res = await this.requestWithAuth<EkartCreateShipmentResponse>(
      '/api/v1/package/create',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    if (!res.status || !res.tracking_id) {
      const errMsg = res.remark || 'Ekart shipment creation failed';
      this.logger.error(
        `Ekart shipment creation failed for order ${params.orderNumber}: ${errMsg}`,
      );
      throw new Error(`Ekart shipment creation failed: ${errMsg}`);
    }

    this.logger.log(
      `Ekart shipment created for order ${params.orderNumber}: tracking_id=${res.tracking_id}.`,
    );

    return {
      isConfigured: true,
      providerName: this.providerName,
      orderId: params.orderNumber,
      shipmentId: res.tracking_id,
      awbCode: res.tracking_id,
      courierName: res.vendor || 'Ekart',
      status: 'Success',
      message: 'Ekart forward shipment created successfully',
    };
  }

  assignAwb(params: AssignAwbParams): Promise<AssignAwbResult> {
    return Promise.resolve({
      isSuccess: true,
      awbCode: String(params.shipmentId),
      courierName: 'Ekart',
      courierCompanyId: 'ekart',
      shipmentId: params.shipmentId,
      message: 'Ekart tracking ID assigned during shipment creation.',
    });
  }

  async getShipmentTrackingByAwb(awb: string): Promise<ShipmentTrackingResult> {
    const cleanAwb = String(awb || '').trim();
    if (!cleanAwb) {
      throw new Error('AWB is required to fetch Ekart tracking');
    }

    const res = await this.requestWithAuth<EkartTrackResponse>(
      `/api/v1/track/${encodeURIComponent(cleanAwb)}`,
      { method: 'GET' },
    );

    const track = res?.track;
    if (!track) {
      return {
        awb: cleanAwb,
        activities: [],
        currentStatus: null,
        etd: null,
        trackUrl: `${this.getBaseUrl()}/track/${cleanAwb}`,
      };
    }

    const activities: Array<Record<string, unknown>> = [];

    if (Array.isArray(track.details)) {
      for (const detail of track.details) {
        activities.push({
          date: detail.ctime ? new Date(detail.ctime).toISOString() : null,
          status: detail.status,
          activity: detail.desc,
          location: detail.location,
          'sr-status-label': detail.status,
        });
      }
    }

    if (track.status) {
      activities.push({
        date: track.ctime ? new Date(track.ctime).toISOString() : null,
        status: track.status,
        activity: track.desc,
        location: track.location,
        'sr-status-label': track.status,
      });
    }

    let etd: string | null = null;
    if (res.edd) {
      etd = new Date(res.edd).toISOString();
    }

    return {
      awb: cleanAwb,
      activities,
      currentStatus: track.status ?? null,
      etd,
      trackUrl: `${this.getBaseUrl()}/track/${cleanAwb}`,
    };
  }

  async cancelShipment(params: {
    shiprocketOrderId?: string | null;
    shiprocketShipmentId?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    const trackingId = (
      params.shiprocketShipmentId || params.shiprocketOrderId || ''
    ).trim();

    if (!trackingId) {
      return {
        success: false,
        message: 'No tracking ID supplied for Ekart cancellation',
      };
    }

    this.logger.log(`Cancelling Ekart shipment: ${trackingId}`);

    const url = `/api/v1/package/cancel?tracking_id=${encodeURIComponent(trackingId)}`;

    const res = await this.requestWithAuth<Record<string, unknown>>(url, {
      method: 'DELETE',
    });

    this.logger.log(`Ekart shipment ${trackingId} cancellation response received.`);

    return {
      success: true,
      message: `Ekart shipment ${trackingId} cancelled successfully`,
    };
  }

  async downloadLabelPdf(trackingIds: string[]): Promise<Buffer> {
    if (!trackingIds || trackingIds.length === 0) {
      throw new Error('At least one tracking ID is required for label download.');
    }

    const response = await this.requestWithAuthRaw(
      '/api/v1/package/label?json_only=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: trackingIds }),
      },
    );

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // --- Return Logistics ---

  async createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult> {
    if (!this.isConfigured()) {
      return {
        isConfigured: false,
        providerName: this.providerName,
        pickupId: null,
        awbNumber: null,
        courierPartner: 'Ekart',
        status: 'UNCONFIGURED',
        message: 'Ekart credentials are not configured.',
      };
    }

    const rawName = (params.pickupAddress.name || '').trim();
    if (!rawName) {
      throw new Error('Customer name is required for Ekart return pickup.');
    }

    const rawPhone = (params.pickupAddress.phone || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !PHONE_REGEX.test(cleanPhone)) {
      throw new Error(
        `Valid 10-digit Indian phone number required for Ekart return pickup (received "${rawPhone}").`,
      );
    }

    const addr = params.pickupAddress;
    if (!addr.city || !addr.state || !addr.pincode) {
      throw new Error(
        'Incomplete pickup address: city, state, and pincode are required for Ekart return pickup.',
      );
    }

    const addressLine = [addr.houseFlat, addr.buildingStreet]
      .filter(Boolean)
      .join(', ')
      .trim();
    if (!addressLine) {
      throw new Error('Street address is required for Ekart return pickup.');
    }

    const returnReason = (params.items || [])
      .map((i) => i.reason)
      .filter(Boolean)
      .join('; ') || 'Customer return';

    const productsDesc = (params.items || [])
      .map((i) => `${i.productName} (x${i.quantity})`)
      .join(', ')
      .slice(0, 250) || 'KickAt Return Pickup';

    const totalQuantity = (params.items || []).reduce(
      (sum, i) => sum + (i.quantity || 1),
      0,
    );

    const returnOrderNumber = `RET-${params.orderNumber}-${params.returnId.slice(0, 8)}`;

    const payload = {
      seller_name: this.getSellerName(),
      seller_address: this.getSellerAddress() || this.getSellerName(),
      seller_gst_tin: this.getSellerGstin(),
      seller_gst_amount: 0,
      consignee_gst_amount: 0,
      order_number: returnOrderNumber,
      invoice_number: returnOrderNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      consignee_name: rawName,
      consignee_alternate_phone: cleanPhone,
      products_desc: productsDesc,
      payment_mode: 'Pickup',
      category_of_goods: 'General Merchandise',
      total_amount: 1,
      tax_value: 0,
      taxable_amount: 1,
      commodity_value: '1',
      cod_amount: 0,
      quantity: totalQuantity || 1,
      weight: 500,
      length: 10,
      height: 10,
      width: 10,
      return_reason: returnReason,
      drop_location: {
        name: rawName,
        phone: Number(cleanPhone),
        address: addressLine,
        city: addr.city,
        state: addr.state,
        country: 'India',
        pin: Number(addr.pincode),
      },
      pickup_location: { name: this.getPickupAlias() },
      return_location: { name: this.getPickupAlias() },
      service: this.getDefaultService(),
    };

    this.logger.log(
      `Creating Ekart return pickup for order ${params.orderNumber}, returnId=${params.returnId}.`,
    );

    const res = await this.requestWithAuth<EkartCreateShipmentResponse>(
      '/api/v1/package/create',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    if (!res.status || !res.tracking_id) {
      const errMsg = res.remark || 'Ekart return pickup creation failed';
      this.logger.error(
        `Ekart return pickup failed for order ${params.orderNumber}: ${errMsg}`,
      );
      throw new Error(`Ekart return pickup failed: ${errMsg}`);
    }

    this.logger.log(
      `Ekart return pickup scheduled for order ${params.orderNumber}: tracking_id=${res.tracking_id}.`,
    );

    return {
      isConfigured: true,
      providerName: this.providerName,
      pickupId: res.tracking_id,
      awbNumber: res.tracking_id,
      courierPartner: res.vendor || 'Ekart',
      trackingUrl: `${this.getBaseUrl()}/track/${res.tracking_id}`,
      status: 'PICKUP_SCHEDULED',
      message: 'Ekart reverse return pickup scheduled successfully',
    };
  }

  async getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult> {
    const cleanAwb = String(shipmentId || '').trim();
    if (!cleanAwb) {
      throw new Error('AWB is required to fetch Ekart return tracking');
    }

    const res = await this.requestWithAuth<EkartTrackResponse>(
      `/api/v1/track/${encodeURIComponent(cleanAwb)}`,
      { method: 'GET' },
    );

    const track = res?.track;
    if (!track) {
      return {
        isConfigured: true,
        providerName: this.providerName,
        shipmentId: cleanAwb,
        currentStatus: 'UNKNOWN',
        checkpoints: [],
      };
    }

    const checkpoints: ReturnTrackingResult['checkpoints'] = [];

    if (Array.isArray(track.details)) {
      for (const detail of track.details) {
        checkpoints.push({
          status: detail.status || '',
          location: detail.location || undefined,
          timestamp: detail.ctime ? new Date(detail.ctime).toISOString() : '',
          description: detail.desc || undefined,
        });
      }
    }

    return {
      isConfigured: true,
      providerName: this.providerName,
      shipmentId: cleanAwb,
      currentStatus: track.status ?? 'UNKNOWN',
      checkpoints,
    };
  }

  async cancelReturnPickup(shipmentId?: string): Promise<boolean> {
    const trackingId = (shipmentId || '').trim();
    if (!trackingId) {
      this.logger.warn('No tracking ID provided for Ekart return cancellation.');
      return false;
    }

    try {
      await this.cancelShipment({ shiprocketShipmentId: trackingId });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ekart return cancellation failed for ${trackingId}: ${msg}`);
      return false;
    }
  }

  handleTrackingUpdate(): Promise<ReturnStatusUpdate> {
    return Promise.resolve({
      status: 'PENDING_INTEGRATION',
      notes: 'Ekart webhook tracking update handled by EkartWebhookService.',
    });
  }
}
