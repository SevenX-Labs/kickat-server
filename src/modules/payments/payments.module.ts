import { NotificationsModule } from "../notifications/notifications.module";
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShippingModule } from '../admin/shipping/shipping.module';

@Module({
  // ShippingModule: the Shiprocket shipment is created only after a payment is
  // verified (see PaymentsService.promoteOrderAfterPayment). ShippingModule
  // does not import PaymentsModule, so there is no circular dependency.
  imports: [PrismaModule, NotificationsModule, ShippingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService],
  exports: [PaymentsService, RazorpayService],
})
export class PaymentsModule {}
