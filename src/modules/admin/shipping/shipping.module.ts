import { NotificationsModule } from "../../notifications/notifications.module";
import { PaymentsModule } from "../../payments/payments.module";
import { Module, forwardRef } from "@nestjs/common";
import { ShippingService } from "./shipping.service";
import { ShippingController } from "./shipping.controller";
import { EkartWebhookController } from "./ekart-webhook.controller";
import { EkartWebhookService } from "./ekart-webhook.service";
import { NullShippingProvider } from "./providers/null-shipping.provider";
import { EkartProvider } from "./providers/ekart.provider";
import { DeliveryEstimateService } from "./delivery-estimate.service";
import { DeliveryEstimateController } from "./delivery-estimate.controller";
import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { ShipmentTrackingSyncService } from "./shipment-tracking-sync.service";

@Module({
  imports: [NotificationsModule, forwardRef(() => PaymentsModule)],
  controllers: [
    ShippingController,
    EkartWebhookController,
    DeliveryEstimateController,
  ],
  providers: [
    ShippingService,
    EkartWebhookService,
    NullShippingProvider,
    EkartProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
  exports: [
    ShippingService,
    EkartWebhookService,
    NullShippingProvider,
    EkartProvider,
    DeliveryEstimateService,
    OrderTrackingEventsService,
    ShipmentTrackingSyncService,
  ],
})
export class ShippingModule {}
