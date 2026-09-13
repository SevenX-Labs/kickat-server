import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { StockReservationCleanupService } from './stock-reservation-cleanup.service';
import { CheckoutController } from './checkout.controller';
import { SettingsModule } from '../admin/settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, StockReservationCleanupService],
  exports: [CheckoutService, StockReservationCleanupService],
})
export class CheckoutModule {}
