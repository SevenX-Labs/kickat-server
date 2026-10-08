import { NotificationsModule } from "../notifications/notifications.module";
import { Module } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";
import { StockReservationCleanupService } from "./stock-reservation-cleanup.service";
import { CheckoutController } from "./checkout.controller";
import { SettingsModule } from "../admin/settings/settings.module";
import { ShippingModule } from "../admin/shipping/shipping.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  // PaymentsModule: place-order creates the Razorpay order for online
  // payments so the client can open the gateway in one round-trip.
  // PaymentsModule does not import CheckoutModule - no circular dependency.
  imports: [SettingsModule, NotificationsModule, ShippingModule, PaymentsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, StockReservationCleanupService],
  exports: [CheckoutService, StockReservationCleanupService],
})
export class CheckoutModule {}
