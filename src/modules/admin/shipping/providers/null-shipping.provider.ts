import { Injectable, Logger } from '@nestjs/common';
import {
  CreateReturnPickupParams,
  ReturnPickupResult,
  ReturnStatusUpdate,
  ReturnTrackingResult,
  ShippingProvider,
} from './shipping-provider.interface';

@Injectable()
export class NullShippingProvider implements ShippingProvider {
  readonly providerName = 'UNCONFIGURED';
  private readonly logger = new Logger(NullShippingProvider.name);

  async createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult> {
    this.logger.warn(
      `No active delivery provider configured for returnId=${params.returnId}, orderId=${params.orderId}. Return remains in pickup-pending state without mock data.`,
    );
    return {
      isConfigured: false,
      providerName: this.providerName,
      pickupId: null,
      awbNumber: null,
      courierPartner: null,
      trackingUrl: null,
      pickupDate: null,
      status: 'PICKUP_REQUESTED',
      message: 'Delivery provider is unconfigured. Return is pending logistics assignment.',
    };
  }

  async getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult> {
    return {
      isConfigured: false,
      providerName: this.providerName,
      shipmentId,
      currentStatus: 'PICKUP_REQUESTED',
      checkpoints: [
        {
          status: 'PICKUP_REQUESTED',
          timestamp: new Date().toISOString(),
          description: 'Return request submitted. Pending logistics provider assignment.',
        },
      ],
    };
  }

  async cancelReturnPickup(shipmentId: string): Promise<boolean> {
    return false;
  }

  async handleTrackingUpdate(payload: any): Promise<ReturnStatusUpdate> {
    return {
      status: 'PICKUP_REQUESTED',
      notes: 'No provider active',
    };
  }
}
