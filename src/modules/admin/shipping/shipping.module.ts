import { NotificationsModule } from "../../notifications/notifications.module";
import { Module } from "@nestjs/common";
import { ShippingService } from "./shipping.service";
import { ShippingController } from "./shipping.controller";
import { ShiprocketWebhookController } from "./shiprocket-webhook.controller";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";
import { DelhiveryWebhookController } from "./delhivery-webhook.controller";
import { DelhiveryWebhookService } from "./delhivery-webhook.service";
import { NullShippingProvider } from "./providers/null-shipping.provider";
import { ShiprocketProvider } from "./providers/shiprocket.provider";
import { DelhiveryProvider } from "./providers/delhivery.provider";
import { DeliveryEstimateService } from "./delivery-estimate.service";
import { DeliveryEstimateController } from "./delivery-estimate.controller";
import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { ShipmentTrackingSyncService } from "./shipment-tracking-sync.service";

@Module({
  imports: [NotificationsModule],
  controllers: [
    ShippingController,
    ShiprocketWebhookController,
    DelhiveryWebhookController,
    DeliveryEstimateController,
  ],
  providers: [
    ShippingService,
    ShiprocketWebhookService,
    DelhiveryWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
    DelhiveryProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
  exports: [
    ShippingService,
    ShiprocketWebhookService,
    DelhiveryWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
    DelhiveryProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
})
export class ShippingModule {}
