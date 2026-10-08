import { InvoicePdfService } from './invoice-pdf.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ReturnsController } from './returns.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SettingsModule } from '../admin/settings/settings.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../admin/shipping/shipping.module';

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    NotificationsModule,
    // Needed by cancelOrder(): gateway refund initiation and provider
    // shipment cancellation. Neither module imports OrdersModule, so there
    // is no circular dependency.
    PaymentsModule,
    ShippingModule,
  ],
  controllers: [OrdersController, ReturnsController],
  providers: [OrdersService, InvoicePdfService],
  exports: [OrdersService, InvoicePdfService],
})
export class OrdersModule {}
