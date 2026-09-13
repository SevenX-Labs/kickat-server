import { NotificationsModule } from "../../notifications/notifications.module";
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { RazorpayService } from '../../payments/razorpay.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, RazorpayService],
})
export class OrdersModule {}
