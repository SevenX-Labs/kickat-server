import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { NullShippingProvider } from './providers/null-shipping.provider';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, NullShippingProvider],
  exports: [ShippingService, NullShippingProvider],
})
export class ShippingModule {}
