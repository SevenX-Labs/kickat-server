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
  ],
  exports: [
    ShippingService,
    ShiprocketWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
    DeliveryEstimateService,
  ],
})
export class ShippingModule {}
