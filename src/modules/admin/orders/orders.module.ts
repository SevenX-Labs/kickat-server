import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { RazorpayService } from '../../payments/razorpay.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, RazorpayService],
})
export class OrdersModule {}
