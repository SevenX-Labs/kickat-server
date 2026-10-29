import { NotificationsModule } from "../notifications/notifications.module";
import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShippingModule } from '../admin/shipping/shipping.module';

@Module({
  imports: [PrismaModule, NotificationsModule, forwardRef(() => ShippingModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService],
  exports: [PaymentsService, RazorpayService],
})
export class PaymentsModule {}
