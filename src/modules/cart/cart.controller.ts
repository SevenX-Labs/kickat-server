import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { BuyNowDto } from './dto/buy-now.dto';
import { AddGuestCartItemDto } from './dto/guest-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { CartItemIdParamDto } from './dto/cart-item-id-param.dto';
import { GuestSessionIdParamDto } from './dto/guest-session-id-param.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('cart')
@UseGuards(ThrottlerGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /cart (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Get()
  async getCart(@CurrentUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  /**
   * POST /cart/items (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Post('items')
  async addCartItem(
    @CurrentUser('id') userId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addCartItem(userId, dto);
  }

  /**
   * PUT /cart/items/:itemId (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Put('items/:itemId')
  async updateCartItem(
    @CurrentUser('id') userId: string,
    @Param() params: CartItemIdParamDto,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(
      userId,
      params.itemId,
      dto.quantity,
    );
  }

  /**
   * DELETE /cart/items/:itemId (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  async removeCartItem(
    @CurrentUser('id') userId: string,
    @Param() params: CartItemIdParamDto,
  ) {
    return this.cartService.removeCartItem(userId, params.itemId);
  }

  /**
   * POST /cart/buy-now (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Post('buy-now')
  async buyNow(@CurrentUser('id') userId: string, @Body() dto: BuyNowDto) {
    return this.cartService.buyNow(userId, dto);
  }

  /**
   * POST /cart/guest (No Auth, 20 req / min / IP)
   */
  @Throttle({
    'guest-cart': { limit: 20, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    search: { limit: 10000, ttl: 60000 },
    products: { limit: 10000, ttl: 60000 },
    'reviews-helpful': { limit: 10000, ttl: 60000 },
  })
  @Post('guest')
  async addGuestCartItem(@Body() dto: AddGuestCartItemDto) {
    return this.cartService.addGuestCartItem(dto);
  }

  /**
   * GET /cart/guest/:sessionId (No Auth, 20 req / min / IP)
   */
  @Throttle({
    'guest-cart': { limit: 20, ttl: 60000 },
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
    search: { limit: 10000, ttl: 60000 },
    products: { limit: 10000, ttl: 60000 },
    'reviews-helpful': { limit: 10000, ttl: 60000 },
  })
  @Get('guest/:sessionId')
  async getGuestCart(@Param() params: GuestSessionIdParamDto) {
    return this.cartService.getGuestCart(params.sessionId);
  }

  /**
   * POST /cart/merge (Auth Required)
   */
  @SkipThrottle()
  @Auth()
  @Post('merge')
  async mergeCart(
    @CurrentUser('id') userId: string,
    @Body() dto: MergeCartDto,
  ) {
    return this.cartService.mergeCart(userId, dto.guestSessionId);
  }
}
