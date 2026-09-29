import { NotificationsModule } from '../../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { NullShippingProvider } from './providers/null-shipping.provider';
import { ShiprocketProvider } from './providers/shiprocket.provider';

@Module({
  imports: [NotificationsModule],
  controllers: [ShippingController],
  providers: [ShippingService, NullShippingProvider, ShiprocketProvider],
  exports: [ShippingService, NullShippingProvider, ShiprocketProvider],
})
export class ShippingModule {}
