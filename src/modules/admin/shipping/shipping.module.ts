import { NotificationsModule } from "../../notifications/notifications.module";
import { Module } from "@nestjs/common";
import { ShippingService } from "./shipping.service";
import { ShippingController } from "./shipping.controller";
import { ShiprocketWebhookController } from "./shiprocket-webhook.controller";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";
import { NullShippingProvider } from "./providers/null-shipping.provider";
import { ShiprocketProvider } from "./providers/shiprocket.provider";
import { DeliveryEstimateService } from "./delivery-estimate.service";
import { DeliveryEstimateController } from "./delivery-estimate.controller";
import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { ShipmentTrackingSyncService } from "./shipment-tracking-sync.service";

@Module({
  imports: [NotificationsModule],
  controllers: [
    ShippingController,
    ShiprocketWebhookController,
    DeliveryEstimateController,
  ],
  providers: [
    ShippingService,
    ShiprocketWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
  exports: [
    ShippingService,
    ShiprocketWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
})
export class ShippingModule {}
