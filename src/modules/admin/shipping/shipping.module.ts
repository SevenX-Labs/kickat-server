import { NotificationsModule } from "../../notifications/notifications.module";
import { Module } from "@nestjs/common";
import { ShippingService } from "./shipping.service";
import { ShippingController } from "./shipping.controller";
import { ShiprocketWebhookController } from "./shiprocket-webhook.controller";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";
import { NullShippingProvider } from "./providers/null-shipping.provider";
import { ShiprocketProvider } from "./providers/shiprocket.provider";

@Module({
  imports: [NotificationsModule],
  controllers: [ShippingController, ShiprocketWebhookController],
  providers: [
    ShippingService,
    ShiprocketWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
  ],
  exports: [
    ShippingService,
    ShiprocketWebhookService,
    NullShippingProvider,
    ShiprocketProvider,
  ],
})
export class ShippingModule {}
