import { InvoicePdfService } from "./invoice-pdf.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ReturnsController } from './returns.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SettingsModule } from '../admin/settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule, NotificationsModule],
  controllers: [OrdersController, ReturnsController],
  providers: [OrdersService, InvoicePdfService],
  exports: [OrdersService, InvoicePdfService],
})
export class OrdersModule {}
