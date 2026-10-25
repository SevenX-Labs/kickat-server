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

export interface DelhiveryPostalCodeData {
  remarks?: string;
  pin: number | string;
  country_code?: string;
  state_code?: string;
  district?: string;
  city?: string;
  cod?: 'Y' | 'N';
  pre_paid?: 'Y' | 'N';
  pickup?: 'Y' | 'N';
  cash?: 'Y' | 'N';
  repl?: 'Y' | 'N';
  is_oda?: 'Y' | 'N';
  sort_code?: string;
  max_amount?: number;
  max_weight?: number;
  covid_zone?: string;
  inc?: string;
  center?: any[];
  sun_tat?: boolean;
  protect_blacklist?: boolean;
  srv_wt_th?: number;
  [key: string]: unknown;
}

export interface DelhiveryPincodeItem {
  postal_code: DelhiveryPostalCodeData;
}

export interface DelhiveryPincodeResponse {
  delivery_codes?: DelhiveryPincodeItem[];
  [key: string]: unknown;
}

export interface DelhiveryScanDetail {
  ScanDateTime?: string;
  ScanType?: string;
  Scan?: string;
  StatusDateTime?: string;
  ScannedLocation?: string;
  Instructions?: string;
  [key: string]: unknown;
}

export interface DelhiveryTrackingShipment {
  AWB?: string;
  Status?: {
    Status?: string;
    StatusDateTime?: string;
    StatusType?: string;
    Instructions?: string;
    StatusLocation?: string;
    [key: string]: unknown;
  };
  Scans?: Array<{
    ScanDetail?: DelhiveryScanDetail;
    [key: string]: unknown;
  }>;
  ExpectedDeliveryDate?: string;
  PickUpDate?: string;
  Consignee?: {
    Name?: string;
    City?: string;
    PinCode?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DelhiveryTrackingResponse {
  ShipmentData?: Array<{
    Shipment?: DelhiveryTrackingShipment;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface DelhiveryCmuShipmentItem {
  name: string;
  add: string;
  pin: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  order: string;
  payment_mode: 'Prepaid' | 'COD';
  cod_amount: string | number;
  total_amount: string | number;
  order_date?: string;
  products_desc: string;
  quantity: string | number;
  weight: number; // in grams
  shipment_height?: number;
  shipment_width?: number;
  shipment_length?: number;
  shipping_mode?: 'Surface' | 'Express';
  return_pin?: string;
  return_city?: string;
  return_phone?: string;
  return_add?: string;
  return_state?: string;
  return_country?: string;
  seller_add?: string;
  seller_name?: string;
  seller_inv?: string;
  waybill?: string;
  package_type?: string;
  return_name?: string;
  [key: string]: unknown;
}

export interface DelhiveryCmuPayload {
  shipments: DelhiveryCmuShipmentItem[];
  pickup_location: {
    name: string;
    add?: string;
    city?: string;
    pin_code?: string;
    phone?: string;
  };
}

export interface DelhiveryCreatePackageResult {
  status?: string;
  client?: string;
  sort_code?: string;
  remarks?: string[];
  waybill?: string;
  cod_amount?: number;
  payment?: string;
  serviceable?: boolean;
  [key: string]: unknown;
}

export interface DelhiveryCreateResponse {
  cash_pickups_count?: number;
  package_count?: number;
  upload_wbn?: string;
  replacement_count?: number;
  rmk?: string;
  packages?: DelhiveryCreatePackageResult[];
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface DelhiveryCancelResponse {
  status?: boolean | string;
  remarks?: string[];
  message?: string;
  error?: string;
  [key: string]: unknown;
}

const PHONE_REGEX = /^[6-9]\d{9}$/;

@Injectable()
export class DelhiveryProvider implements ShippingProvider {
  readonly providerName = 'DELHIVERY';
  private readonly logger = new Logger(DelhiveryProvider.name);
  private readonly defaultTimeoutMs = 15000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if Delhivery API key is configured in the environment
   */
  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Safe retrieval of DELHIVERY_API_KEY
   */
  private getApiKey(): string {
    return (
      this.configService.get<string>('DELHIVERY_API_KEY', '') || ''
    ).trim();
  }

  /**
   * Safe retrieval of DELHIVERY_BASE_URL, default to production endpoint
   */
  private getBaseUrl(): string {
    const raw = (
      this.configService.get<string>('DELHIVERY_BASE_URL', '') || ''
    ).trim();
    return raw ? raw.replace(/\/+$/, '') : 'https://track.delhivery.com';
  }

  /**
   * Resolves configured pickup warehouse name for Delhivery
   */
  private getPickupLocation(explicitLocation?: string): string {
    const loc = (
      explicitLocation ||
      this.configService.get<string>('DELHIVERY_PICKUP_LOCATION', '') ||
      ''
    ).trim();
    return loc;
  }

  /**
   * Default shipping mode ("Surface" or "Express")
   */
  private getShippingMode(): 'Surface' | 'Express' {
    const mode = (
      this.configService.get<string>('DELHIVERY_SHIPPING_MODE', 'Surface') ||
      'Surface'
    )
      .trim()
      .toLowerCase();
    return mode === 'express' ? 'Express' : 'Surface';
  }

  /**
   * Authenticated HTTP request wrapper for Delhivery APIs
   */
  private async requestWithAuth<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Delhivery credentials missing: DELHIVERY_API_KEY must be set in environment variables.',
      );
    }

    const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.getBaseUrl()}${normalizedPath}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'KickAt-Server/1.0',
      Authorization: `Token ${apiKey}`,
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
        ? `Delhivery API request to ${normalizedPath} timed out`
        : `Delhivery API network error on ${normalizedPath}`;
      const detail =
        networkErr instanceof Error ? networkErr.message : String(networkErr);
      this.logger.error(`${msg}: ${detail}`);
      throw new Error(msg);
    }

    if (!response.ok) {
      let safeError = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = (await response.json()) as any;
        if (errorJson && typeof errorJson === 'object') {
          safeError =
            errorJson.message ||
            errorJson.error ||
            errorJson.rmk ||
            JSON.stringify(errorJson);
        }
      } catch {
        // Body was not JSON
      }
      this.logger.error(
        `Delhivery API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
      throw new Error(
        `Delhivery API error [${response.status}] on ${normalizedPath}: ${safeError}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Evaluates PIN-code serviceability using Delhivery production endpoint:
   * GET /c/api/pin-codes/json/?filter_codes={pincode}
   */
  async checkServiceability(
    params: ServiceabilityQueryParams,
  ): Promise<{
    isServiceable: boolean;
    pincode: string;
    city?: string;
    district?: string;
    state?: string;
    codAvailable: boolean;
    prepaidAvailable: boolean;
    isOda: boolean;
    sortCode?: string;
    maxWeight?: number;
    raw: DelhiveryPincodeResponse;
  }> {
    const rawPincode = String(params.deliveryPostcode || '').trim();
    if (!/^[1-9][0-9]{5}$/.test(rawPincode)) {
      return {
        isServiceable: false,
        pincode: rawPincode,
        codAvailable: false,
        prepaidAvailable: false,
        isOda: false,
        raw: {},
      };
    }

    const res = await this.requestWithAuth<DelhiveryPincodeResponse>(
      `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(rawPincode)}`,
      { method: 'GET' },
    );

    const deliveryCodes = res?.delivery_codes;
    if (!Array.isArray(deliveryCodes) || deliveryCodes.length === 0) {
      return {
        isServiceable: false,
        pincode: rawPincode,
        codAvailable: false,
        prepaidAvailable: false,
        isOda: false,
        raw: res,
      };
    }

    const matched = deliveryCodes.find(
      (item) => String(item.postal_code?.pin) === rawPincode,
    );
    const postal = matched?.postal_code || deliveryCodes[0]?.postal_code;

    if (!postal) {
      return {
        isServiceable: false,
        pincode: rawPincode,
        codAvailable: false,
        prepaidAvailable: false,
        isOda: false,
        raw: res,
      };
    }

    const codAvailable = postal.cod === 'Y';
    const prepaidAvailable = postal.pre_paid === 'Y';
    const isOda = postal.is_oda === 'Y';

    // Verify serviceability against order payment method requirement
    let isServiceable = false;
    if (params.cod) {
      isServiceable = codAvailable;
    } else {
      isServiceable = prepaidAvailable;
    }

    // Weight check if provider specifies srv_wt_th / max_weight limit
    const maxWeight =
      postal.max_weight && postal.max_weight > 0
        ? postal.max_weight
        : postal.srv_wt_th && postal.srv_wt_th > 0
          ? postal.srv_wt_th
          : undefined;

    if (isServiceable && maxWeight && params.weight > maxWeight) {
      this.logger.warn(
        `Delhivery serviceability: package weight ${params.weight}kg exceeds max weight ${maxWeight}kg for pincode ${rawPincode}.`,
      );
      isServiceable = false;
    }

    return {
      isServiceable,
      pincode: rawPincode,
      city: postal.city,
      district: postal.district,
      state: postal.state_code,
      codAvailable,
      prepaidAvailable,
      isOda,
      sortCode: postal.sort_code,
      maxWeight,
      raw: res,
    };
  }

  /**
   * Returns recommended courier for serviceability query
   */
  async getRecommendedCourier(
    params: ServiceabilityQueryParams,
  ): Promise<AvailableCourier | null> {
    try {
      const check = await this.checkServiceability(params);
      if (!check.isServiceable) {
        return null;
      }

      return {
        courierCompanyId: 'delhivery',
        courierName: `Delhivery ${this.getShippingMode()}`,
        isRecommended: true,
      };
    } catch (err: any) {
      this.logger.warn(
        `Delhivery serviceability check failed for pincode ${params.deliveryPostcode}: ${err?.message || err}`,
      );
      return null;
    }
  }

  /**
   * Resolves registered pickup location pincode
   */
  async getPickupLocationPincode(
    _pickupLocationName: string,
  ): Promise<string | null> {
    const directPincode = (
      this.configService.get<string>('DELHIVERY_PICKUP_PINCODE', '') ||
      ''
    ).trim();

    if (directPincode && /^\d{6}$/.test(directPincode)) {
      return directPincode;
    }

    return null;
  }

  /**
   * Tracking lookup by AWB:
   * GET /api/v1/packages/json/?waybill={awb}
   */
  async getShipmentTrackingByAwb(awb: string): Promise<ShipmentTrackingResult> {
    const cleanAwb = String(awb || '').trim();
    if (!cleanAwb) {
      throw new Error('AWB is required to fetch Delhivery tracking');
    }

    const res = await this.requestWithAuth<DelhiveryTrackingResponse>(
      `/api/v1/packages/json/?waybill=${encodeURIComponent(cleanAwb)}`,
      { method: 'GET' },
    );

    const shipmentItem = res?.ShipmentData?.[0]?.Shipment;
    if (!shipmentItem) {
      return {
        awb: cleanAwb,
        activities: [],
        currentStatus: null,
        etd: null,
        trackUrl: `https://www.delhivery.com/track/package/${cleanAwb}`,
      };
    }

    const scans = Array.isArray(shipmentItem.Scans) ? shipmentItem.Scans : [];
    const activities = scans
      .map((item) => {
        const detail = item.ScanDetail;
        if (!detail) return null;
        return {
          date: detail.ScanDateTime || detail.StatusDateTime,
          status: detail.Scan || detail.Instructions,
          activity: detail.Instructions || detail.Scan,
          location: detail.ScannedLocation,
          'sr-status-label': detail.Scan || detail.Instructions,
          rawScan: detail,
        };
      })
      .filter((a): a is NonNullable<typeof a> => !!a);

    return {
      awb: cleanAwb,
      activities,
      currentStatus: shipmentItem.Status?.Status ?? null,
      etd: shipmentItem.ExpectedDeliveryDate ?? null,
      trackUrl: `https://www.delhivery.com/track/package/${cleanAwb}`,
    };
  }

  /**
   * Forward shipment creation via Delhivery CMU Push API:
   * POST /api/cmu/create.json (or /cmu/push/json/)
   *
   * Formats payload and allocates waybill in a single operation.
   */
  async createShipment(
    params: CreateShipmentParams,
  ): Promise<CreateShipmentResult> {
    const pickupLocation = this.getPickupLocation(params.pickupLocation);
    if (!pickupLocation) {
      throw new Error(
        'Delhivery pickup location is not configured. Configure DELHIVERY_PICKUP_LOCATION in environment or provide pickupLocation in params.',
      );
    }

    const rawName = (
      params.customer.name ||
      params.shippingAddress.name ||
      ''
    ).trim();
    if (!rawName) {
      throw new Error(
        'Customer name is required for Delhivery shipment creation.',
      );
    }

    const rawPhone = (
      params.customer.phone ||
      params.shippingAddress.phone ||
      ''
    ).trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !PHONE_REGEX.test(cleanPhone)) {
      throw new Error(
        `Valid 10-digit Indian phone number is required for Delhivery shipment creation (received "${rawPhone}").`,
      );
    }

    const shippingAddress = params.shippingAddress;
    if (
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.pincode
    ) {
      throw new Error(
        'Incomplete shipping address: city, state, and pincode are required for Delhivery.',
      );
    }

    const addressLine = [
      shippingAddress.houseFlat,
      shippingAddress.buildingStreet,
      shippingAddress.landmark,
    ]
      .filter(Boolean)
      .join(', ')
      .trim();

    if (!addressLine) {
      throw new Error(
        'Street address is required for Delhivery shipment creation.',
      );
    }

    const isCod = params.paymentMethod?.toUpperCase() === 'COD';
    const weightInGrams = Math.max(
      50,
      Math.round((params.packageDetails?.weight || 0.5) * 1000),
    );

    const productDesc = (params.items || [])
      .map((i) => `${i.productName} (x${i.quantity})`)
      .join(', ')
      .slice(0, 250);

    const totalQuantity = (params.items || []).reduce(
      (sum, i) => sum + (i.quantity || 1),
      0,
    );

    const shipmentPayload: DelhiveryCmuShipmentItem = {
      name: rawName,
      add: addressLine,
      pin: shippingAddress.pincode,
      city: shippingAddress.city,
      state: shippingAddress.state,
      country: shippingAddress.country || 'India',
      phone: cleanPhone,
      order: params.orderNumber,
      payment_mode: isCod ? 'COD' : 'Prepaid',
      cod_amount: isCod ? params.grandTotal.toFixed(2) : '0',
      total_amount: params.grandTotal.toFixed(2),
      order_date:
        params.orderDate instanceof Date
          ? params.orderDate.toISOString()
          : typeof params.orderDate === 'string'
            ? params.orderDate
            : new Date().toISOString(),
      products_desc: productDesc || 'KickAt Store Order',
      quantity: totalQuantity,
      weight: weightInGrams,
      shipment_length: params.packageDetails?.length || 10,
      shipment_width: params.packageDetails?.breadth || 10,
      shipment_height: params.packageDetails?.height || 10,
      shipping_mode: this.getShippingMode(),
    };

    const cmuData: DelhiveryCmuPayload = {
      shipments: [shipmentPayload],
      pickup_location: {
        name: pickupLocation,
      },
    };

    const bodyParams = new URLSearchParams();
    bodyParams.set('format', 'json');
    bodyParams.set('data', JSON.stringify(cmuData));

    this.logger.log(
      `Creating Delhivery shipment for order ${params.orderNumber} (weight=${weightInGrams}g, cod=${isCod}).`,
    );

    const res = await this.requestWithAuth<DelhiveryCreateResponse>(
      '/api/cmu/create.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      },
    );

    const pkg = res?.packages?.[0];
    if (res.success === false || pkg?.status?.toLowerCase() === 'fail') {
      const remark =
        pkg?.remarks?.join('; ') || res.rmk || res.error || 'Unknown error';
      this.logger.error(
        `Delhivery shipment creation failed for order ${params.orderNumber}: ${remark}`,
      );
      throw new Error(`Delhivery shipment creation failed: ${remark}`);
    }

    const waybill = pkg?.waybill || null;
    if (!waybill) {
      throw new Error(
        'Delhivery shipment creation succeeded but no waybill was returned in packages array.',
      );
    }

    this.logger.log(
      `Delhivery shipment created successfully for order ${params.orderNumber}: waybill=${waybill}.`,
    );

    return {
      isConfigured: true,
      providerName: this.providerName,
      orderId: res.upload_wbn || params.orderNumber,
      shipmentId: String(waybill),
      awbCode: String(waybill),
      courierName: 'Delhivery',
      status: pkg?.status || 'Success',
      message: 'Delhivery forward shipment created successfully',
    };
  }

  /**
   * Assign AWB is a no-op for Delhivery because waybills are generated
   * atomically in createShipment. Returns current waybill.
   */
  assignAwb(params: AssignAwbParams): Promise<AssignAwbResult> {
    return Promise.resolve({
      isSuccess: true,
      awbCode: String(params.shipmentId),
      courierName: 'Delhivery',
      courierCompanyId: 'delhivery',
      shipmentId: params.shipmentId,
      message: 'Delhivery waybill assigned during shipment creation.',
    });
  }

  /**
   * Cancels a forward shipment in Delhivery:
   * POST /api/p/edit
   * Body: { waybill: "...", cancellation: "true" }
   */
  async cancelShipment(params: {
    shiprocketOrderId?: string | null;
    shiprocketShipmentId?: string | null;
    waybill?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    const targetWaybill = (
      params.waybill ||
      params.shiprocketShipmentId ||
      params.shiprocketOrderId ||
      ''
    ).trim();

    if (!targetWaybill) {
      return {
        success: false,
        message: 'No waybill identifier supplied for Delhivery cancellation',
      };
    }

    this.logger.log(
      `Cancelling Delhivery package with waybill: ${targetWaybill}`,
    );

    const res = await this.requestWithAuth<DelhiveryCancelResponse>(
      '/api/p/edit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          waybill: targetWaybill,
          cancellation: 'true',
        }),
      },
    );

    const isSuccess =
      res?.status === true ||
      String(res?.status).toLowerCase() === 'true' ||
      String(res?.message || '').toLowerCase().includes('success');

    if (!isSuccess) {
      const errMsg =
        res?.remarks?.join('; ') ||
        res?.message ||
        res?.error ||
        'Delhivery cancellation request rejected';
      this.logger.warn(
        `Delhivery cancellation failed for waybill ${targetWaybill}: ${errMsg}`,
      );
      return {
        success: false,
        message: errMsg,
      };
    }

    this.logger.log(
      `Delhivery waybill ${targetWaybill} cancelled successfully.`,
    );
    return {
      success: true,
      message: `Delhivery shipment ${targetWaybill} cancelled successfully`,
    };
  }

  // --- Return Logistics ---

  async createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Delhivery not configured for return pickup: returnId=${params.returnId}, orderId=${params.orderId}.`,
      );
      return {
        isConfigured: false,
        providerName: this.providerName,
        pickupId: null,
        awbNumber: null,
        courierPartner: 'Delhivery',
        status: 'UNCONFIGURED',
        message: 'Delhivery API key is not configured.',
      };
    }

    const pickupLocation = this.getPickupLocation();
    if (!pickupLocation) {
      throw new Error(
        'Delhivery pickup location is not configured. Set DELHIVERY_PICKUP_LOCATION in environment variables.',
      );
    }

    const rawName = (params.pickupAddress.name || '').trim();
    if (!rawName) {
      throw new Error('Customer name is required for Delhivery return pickup.');
    }

    const rawPhone = (params.pickupAddress.phone || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !PHONE_REGEX.test(cleanPhone)) {
      throw new Error(
        `Valid 10-digit Indian phone number is required for Delhivery return pickup (received "${rawPhone}").`,
      );
    }

    const addr = params.pickupAddress;
    if (!addr.city || !addr.state || !addr.pincode) {
      throw new Error(
        'Incomplete pickup address: city, state, and pincode are required for Delhivery return pickup.',
      );
    }

    const addressLine = [addr.houseFlat, addr.buildingStreet]
      .filter(Boolean)
      .join(', ')
      .trim();
    if (!addressLine) {
      throw new Error(
        'Street address is required for Delhivery return pickup.',
      );
    }

    const productsDesc = (params.items || [])
      .map((i) => `${i.productName} (x${i.quantity})`)
      .join(', ')
      .slice(0, 250);

    const totalQuantity = (params.items || []).reduce(
      (sum, i) => sum + (i.quantity || 1),
      0,
    );

    const weightInGrams = Math.max(50, 500);

    const returnPincode = (
      this.configService.get<string>('DELHIVERY_PICKUP_PINCODE', '') || ''
    ).trim();
    const returnCity = (
      this.configService.get<string>('DELHIVERY_PICKUP_CITY', '') || ''
    ).trim();
    const returnState = (
      this.configService.get<string>('DELHIVERY_PICKUP_STATE', '') || ''
    ).trim();

    const returnOrderNumber = `RET-${params.orderNumber}-${params.returnId.slice(0, 8)}`;

    const shipmentPayload: DelhiveryCmuShipmentItem = {
      name: rawName,
      add: addressLine,
      pin: addr.pincode,
      city: addr.city,
      state: addr.state,
      country: addr.country || 'India',
      phone: cleanPhone,
      order: returnOrderNumber,
      payment_mode: 'Prepaid',
      cod_amount: 0,
      total_amount: 0,
      products_desc: productsDesc || 'KickAt Return Pickup',
      quantity: totalQuantity,
      weight: weightInGrams,
      shipping_mode: this.getShippingMode(),
      return_pin: returnPincode || undefined,
      return_city: returnCity || undefined,
      return_state: returnState || undefined,
      return_country: 'India',
      package_type: 'Pickup',
      return_name: pickupLocation,
    };

    const cmuData: DelhiveryCmuPayload = {
      shipments: [shipmentPayload],
      pickup_location: {
        name: pickupLocation,
      },
    };

    const bodyParams = new URLSearchParams();
    bodyParams.set('format', 'json');
    bodyParams.set('data', JSON.stringify(cmuData));

    this.logger.log(
      `Creating Delhivery return pickup for order ${params.orderNumber}, returnId=${params.returnId}.`,
    );

    const res = await this.requestWithAuth<DelhiveryCreateResponse>(
      '/api/cmu/create.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      },
    );

    const pkg = res?.packages?.[0];
    if (res.success === false || pkg?.status?.toLowerCase() === 'fail') {
      const remark =
        pkg?.remarks?.join('; ') || res.rmk || res.error || 'Unknown error';
      this.logger.error(
        `Delhivery return pickup failed for order ${params.orderNumber}: ${remark}`,
      );
      throw new Error(`Delhivery return pickup failed: ${remark}`);
    }

    const waybill = pkg?.waybill || res.upload_wbn || null;
    if (!waybill) {
      throw new Error(
        'Delhivery return pickup succeeded but no waybill was returned.',
      );
    }

    this.logger.log(
      `Delhivery return pickup scheduled for order ${params.orderNumber}: waybill=${waybill}.`,
    );

    return {
      isConfigured: true,
      providerName: this.providerName,
      pickupId: String(waybill),
      awbNumber: String(waybill),
      courierPartner: 'Delhivery',
      trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
      status: 'PICKUP_SCHEDULED',
      message: 'Delhivery reverse return pickup scheduled successfully',
    };
  }

  async getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult> {
    const cleanAwb = String(shipmentId || '').trim();
    if (!cleanAwb) {
      throw new Error('AWB is required to fetch Delhivery return tracking');
    }

    const res = await this.requestWithAuth<DelhiveryTrackingResponse>(
      `/api/v1/packages/json/?waybill=${encodeURIComponent(cleanAwb)}`,
      { method: 'GET' },
    );

    const shipmentItem = res?.ShipmentData?.[0]?.Shipment;
    if (!shipmentItem) {
      return {
        isConfigured: true,
        providerName: this.providerName,
        shipmentId: cleanAwb,
        currentStatus: 'UNKNOWN',
        checkpoints: [],
      };
    }

    const scans = Array.isArray(shipmentItem.Scans) ? shipmentItem.Scans : [];
    const checkpoints = scans
      .map((item) => {
        const detail = item.ScanDetail;
        if (!detail) return null;
        return {
          status: detail.Scan || detail.Instructions || '',
          location: detail.ScannedLocation || undefined,
          timestamp: detail.ScanDateTime || detail.StatusDateTime || '',
          description: detail.Instructions || undefined,
        };
      })
      .filter((c): c is NonNullable<typeof c> => !!c);

    return {
      isConfigured: true,
      providerName: this.providerName,
      shipmentId: cleanAwb,
      currentStatus: shipmentItem.Status?.Status ?? 'UNKNOWN',
      checkpoints,
    };
  }

  async cancelReturnPickup(shipmentId?: string): Promise<boolean> {
    const targetWaybill = (shipmentId || '').trim();
    if (!targetWaybill) {
      this.logger.warn('No waybill provided for Delhivery return cancellation.');
      return false;
    }

    this.logger.log(
      `Cancelling Delhivery return pickup with waybill: ${targetWaybill}`,
    );

    const res = await this.requestWithAuth<DelhiveryCancelResponse>(
      '/api/p/edit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          waybill: targetWaybill,
          cancellation: 'true',
        }),
      },
    );

    const isSuccess =
      res?.status === true ||
      String(res?.status).toLowerCase() === 'true' ||
      String(res?.message || '').toLowerCase().includes('success');

    if (!isSuccess) {
      const errMsg =
        res?.remarks?.join('; ') ||
        res?.message ||
        res?.error ||
        'Delhivery return cancellation rejected';
      this.logger.warn(
        `Delhivery return cancellation failed for waybill ${targetWaybill}: ${errMsg}`,
      );
      return false;
    }

    this.logger.log(
      `Delhivery return waybill ${targetWaybill} cancelled successfully.`,
    );
    return true;
  }

  handleTrackingUpdate(): Promise<ReturnStatusUpdate> {
    return Promise.resolve({
      status: 'PENDING_INTEGRATION',
      notes:
        'Delhivery webhook tracking update scheduled for subsequent phase.',
    });
  }
}
