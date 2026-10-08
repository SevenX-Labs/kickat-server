import { InvoicePdfService } from "../../orders/invoice-pdf.service";
import { NotificationsModule } from "../../notifications/notifications.module";
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { RazorpayService } from '../../payments/razorpay.service';
import { SettingsModule } from '../settings/settings.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PaymentsModule } from '../../payments/payments.module';

@Module({
  // ShippingModule: admin cancel syncs the cancellation to the shipping
  // provider via ShippingService.cancelShipmentForOrder.
  // PaymentsModule: admin cancel auto-refunds a captured payment via
  // PaymentsService.initiateRefundForOrder. Neither module imports this one,
  // so there is no circular dependency.
  imports: [
    NotificationsModule,
    SettingsModule,
    ShippingModule,
    PaymentsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, RazorpayService, InvoicePdfService],
})
export class OrdersModule {}
