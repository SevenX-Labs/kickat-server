import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { ValidateAddressDto } from './dto/validate-address.dto';
import { DeliverySlotsQueryDto } from './dto/delivery-slots-query.dto';
import { PaymentMethodsQueryDto } from './dto/payment-methods-query.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { Auth, CurrentUser } from '../../common';

@Auth()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /**
   * GET /checkout
   */
  @Get()
  async getCheckout(@CurrentUser('id') userId: string) {
    return this.checkoutService.getCheckout(userId);
  }

  /**
   * POST /checkout/validate-address
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
   * GET /checkout/delivery-slots
   */
  @Get('delivery-slots')
  async getDeliverySlots(@Query() query: DeliverySlotsQueryDto) {
    return this.checkoutService.getDeliverySlots(query.pincode, query.date);
  }

  /**
   * GET /checkout/payment-methods
   */
  @Get('payment-methods')
  async getPaymentMethods(@Query() query: PaymentMethodsQueryDto) {
    return this.checkoutService.getPaymentMethods(
      query.orderAmount,
      query.pincode,
    );
  }

  /**
   * POST /checkout/place-order (Idempotent)
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
