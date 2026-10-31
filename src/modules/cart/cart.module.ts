import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartCacheService } from './cart-cache.service';
import { CartController } from './cart.controller';
import { SettingsModule } from '../admin/settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [CartController],
  providers: [CartService, CartCacheService],
  exports: [CartService, CartCacheService],
})
export class CartModule {}
