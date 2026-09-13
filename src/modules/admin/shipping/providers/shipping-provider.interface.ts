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
  createReturnPickup(params: CreateReturnPickupParams): Promise<ReturnPickupResult>;
  getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult>;
  cancelReturnPickup(shipmentId: string): Promise<boolean>;
  handleTrackingUpdate(payload: any): Promise<ReturnStatusUpdate>;
}
