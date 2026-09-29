import { Injectable, Logger } from '@nestjs/common';
import {
  CreateReturnPickupParams,
  CreateShipmentParams,
  CreateShipmentResult,
  ReturnPickupResult,
  ReturnStatusUpdate,
  ReturnTrackingResult,
  ShippingProvider,
} from './shipping-provider.interface';

@Injectable()
export class NullShippingProvider implements ShippingProvider {
  readonly providerName = 'UNCONFIGURED';
  private readonly logger = new Logger(NullShippingProvider.name);

  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
    this.logger.warn(
      `No active delivery provider configured for orderId=${params.orderId}, orderNumber=${params.orderNumber}. Forward shipment remains unassigned.`,
    );
    return Promise.resolve({
      isConfigured: false,
      providerName: this.providerName,
      orderId: null,
      shipmentId: null,
      status: 'UNCONFIGURED',
      message:
        'Delivery provider is unconfigured. Order is pending logistics assignment.',
    });
  }

  createReturnPickup(
    params: CreateReturnPickupParams,
  ): Promise<ReturnPickupResult> {
    this.logger.warn(
      `No active delivery provider configured for returnId=${params.returnId}, orderId=${params.orderId}. Return remains in pickup-pending state without mock data.`,
    );
    return Promise.resolve({
      isConfigured: false,
      providerName: this.providerName,
      pickupId: null,
      awbNumber: null,
      courierPartner: null,
      trackingUrl: null,
      pickupDate: null,
      status: 'PICKUP_REQUESTED',
      message:
        'Delivery provider is unconfigured. Return is pending logistics assignment.',
    });
  }

  getReturnTracking(shipmentId: string): Promise<ReturnTrackingResult> {
    return Promise.resolve({
      isConfigured: false,
      providerName: this.providerName,
      shipmentId,
      currentStatus: 'PICKUP_REQUESTED',
      checkpoints: [
        {
          status: 'PICKUP_REQUESTED',
          timestamp: new Date().toISOString(),
          description:
            'Return request submitted. Pending logistics provider assignment.',
        },
      ],
    });
  }

  cancelReturnPickup(): Promise<boolean> {
    return Promise.resolve(false);
  }

  handleTrackingUpdate(): Promise<ReturnStatusUpdate> {
    return Promise.resolve({
      status: 'PICKUP_REQUESTED',
      notes: 'No provider active',
    });
  }
}
