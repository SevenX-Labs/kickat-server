import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistQueryDto } from './dto/wishlist-query.dto';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { WishlistProductIdParamDto } from './dto/wishlist-product-id-param.dto';
import { MoveToCartDto } from './dto/move-to-cart.dto';
import { Auth, CurrentUser } from '../../common';

@Auth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  /**
   * GET /wishlist
   */
  @Get()
  async getWishlist(
    @CurrentUser('id') userId: string,
    @Query() query: WishlistQueryDto,
  ) {
    return this.wishlistService.getWishlist(userId, query);
  }

  /**
   * POST /wishlist
   */
  @Post()
  async addToWishlist(
    @CurrentUser('id') userId: string,
    @Body() dto: AddToWishlistDto,
  ) {
    return this.wishlistService.addToWishlist(userId, dto);
  }

  /**
   * DELETE /wishlist/:productId
   */
  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  async removeFromWishlist(
    @CurrentUser('id') userId: string,
    @Param() params: WishlistProductIdParamDto,
  ) {
    return this.wishlistService.removeFromWishlist(userId, params.productId);
  }

  /**
   * POST /wishlist/:productId/move-to-cart
   */
  @Post(':productId/move-to-cart')
  @HttpCode(HttpStatus.OK)
  async moveToCart(
    @CurrentUser('id') userId: string,
    @Param() params: WishlistProductIdParamDto,
    @Body() dto: MoveToCartDto,
  ) {
    return this.wishlistService.moveToCart(
      userId,
      params.productId,
      dto.quantity,
    );
  }
}
