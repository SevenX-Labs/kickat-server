import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { ValidateAddressDto } from './dto/validate-address.dto';
import { PaymentMethodsQueryDto } from './dto/payment-methods-query.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { Auth, CurrentUser } from '../../common';

@Auth()
@Controller('checkout')
@UseGuards(ThrottlerGuard)
@Throttle({ checkout: { limit: 20, ttl: 60000 } })
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /**
   * GET /checkout (20 req / min / user)
   */
  @Get()
  async getCheckout(
    @CurrentUser('id') userId: string,
    @Query('buyNowProductId') buyNowProductId?: string,
    @Query('buyNowVariantId') buyNowVariantId?: string,
    @Query('buyNowQuantity') buyNowQuantity?: string,
  ) {
    const qty = buyNowQuantity ? parseInt(buyNowQuantity, 10) : undefined;
    return this.checkoutService.getCheckout(userId, {
      buyNowProductId,
      buyNowVariantId,
      buyNowQuantity: qty && !isNaN(qty) && qty > 0 ? qty : 1,
    });
  }

  /**
   * POST /checkout/validate-address (20 req / min / user)
   */
  @Post('validate-address')
  @HttpCode(HttpStatus.OK)
  async validateAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateAddressDto,
  ) {
    return this.checkoutService.validateAddress(userId, dto);
  }

  /**
   * GET /checkout/payment-methods (20 req / min / user)
   */
  @Get('payment-methods')
  async getPaymentMethods(@Query() query: PaymentMethodsQueryDto) {
    return this.checkoutService.getPaymentMethods(
      query.orderAmount,
      query.pincode,
    );
  }

  /**
   * POST /checkout/place-order (Idempotent, 20 req / min / user)
   */
  @Post('place-order')
  async placeOrder(
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.checkoutService.placeOrder(userId, idempotencyKey, dto);
  }
}
