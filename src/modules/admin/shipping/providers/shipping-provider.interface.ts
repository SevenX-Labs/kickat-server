export interface CreateShipmentPackageDetails {
  weight?: number; // in kg
  length?: number; // in cm
  breadth?: number; // in cm
  height?: number; // in cm
}

export interface CreateShipmentParams {
  orderId: string;
  orderNumber: string;
  orderDate?: Date | string;
  paymentMethod: string;
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  taxAmount?: number;
  grandTotal: number;
  pickupLocation?: string;
  packageDetails?: CreateShipmentPackageDetails;
  customer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  shippingAddress: {
    name?: string | null;
    phone?: string | null;
    houseFlat: string;
    buildingStreet: string;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string | null;
  };
  billingAddress?: {
    name?: string | null;
    phone?: string | null;
    houseFlat: string;
    buildingStreet: string;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string | null;
  };
  items: Array<{
    productId: string;
    productName: string;
    variantName?: string | null;
    sku?: string | null;
    quantity: number;
    price: number;
    totalPrice?: number;
  }>;
}

export interface CreateShipmentResult {
  isConfigured: boolean;
  providerName: string;
  orderId?: string | null; // Remote Shiprocket order ID
  shipmentId?: string | null; // Remote Shiprocket shipment ID
  status?: string | null;
  statusCode?: number | null;
  awbCode?: string | null;
  courierName?: string | null;
  message?: string | null;
}

export interface AssignAwbParams {
  shipmentId: string | number;
  courierId: string | number;
}

export interface AssignAwbResult {
  isSuccess: boolean;
  awbCode?: string | null;
  courierName?: string | null;
  courierCompanyId?: string | number | null;
  shipmentId?: string | number | null;
  orderId?: string | number | null;
  pickupScheduledDate?: string | null;
  message?: string | null;
  rawResponse?: any;
}

export interface ServiceabilityQueryParams {
  pickupPostcode: string;
  deliveryPostcode: string;
  weight: number;
  cod: boolean;
  length?: number;
  breadth?: number;
  height?: number;
}

export interface AvailableCourier {
  courierCompanyId: number | string;
  courierName: string;
  rate?: number;
  etd?: string;
  rating?: number;
  isRecommended?: boolean;
}

export interface CreateReturnPickupParams {
  returnId: string;
  orderId: string;
  orderNumber: string;
  pickupAddress: {
    name?: string;
    phone?: string;
    houseFlat: string;
    buildingStreet: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  items: Array<{
    productName: string;
    quantity: number;
    reason: string;
  }>;
}

export interface ReturnPickupResult {
  isConfigured: boolean;
  providerName: string;
  pickupId?: string | null;
  awbNumber?: string | null;
  courierPartner?: string | null;
  trackingUrl?: string | null;
  pickupDate?: string | null;
  status?: string | null;
  message?: string | null;
}

export interface ReturnTrackingResult {
  isConfigured: boolean;
  providerName: string;
  shipmentId: string;
  currentStatus: string;
  checkpoints: Array<{
    status: string;
    location?: string;
    timestamp: string;
    description?: string;
  }>;
}

export interface ReturnStatusUpdate {
  returnId?: string;
  shipmentId?: string;
  status: string;
  location?: string;
  notes?: string;
  timestamp?: string;
}

export interface ShippingProvider {
  readonly providerName: string;
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  checkServiceability?(params: ServiceabilityQueryParams): Promise<any>;
  getRecommendedCourier?(
    params: ServiceabilityQueryParams,
  ): Promise<AvailableCourier | null>;
  assignAwb?(params: AssignAwbParams): Promise<AssignAwbResult>;
  getPickupLocationPincode?(pickupLocation: string): Promise<string | null>;
  /**
   * Cancels a forward shipment/order with the provider. Optional so providers
   * that do not support cancellation (e.g. the null provider) remain valid.
   */
  cancelShipment?(params: {
    shiprocketOrderId?: string | null;
    shiprocketShipmentId?: string | null;
  }): Promise<{ success: boolean; message: string }>;
  createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult>;
  getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult>;
  cancelReturnPickup(shipmentId?: string): Promise<boolean>;
  handleTrackingUpdate(payload?: any): Promise<ReturnStatusUpdate>;
}
