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
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { WishlistService } from "./wishlist.service";
import { WishlistQueryDto } from "./dto/wishlist-query.dto";
import { AddToWishlistDto } from "./dto/add-to-wishlist.dto";
import { WishlistProductIdParamDto } from "./dto/wishlist-product-id-param.dto";
import { MoveToCartDto } from "./dto/move-to-cart.dto";
import { Auth, CurrentUser } from "../../common";

@Auth()
@Controller("wishlist")
@UseGuards(ThrottlerGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  /**
   * GET /wishlist (120 req / min / user)
   */
  @Throttle({ wishlist: { limit: 120, ttl: 60000 } })
  @Get()
  async getWishlist(
    @CurrentUser("id") userId: string,
    @Query() query: WishlistQueryDto,
  ) {
    return this.wishlistService.getWishlist(userId, query);
  }

  /**
   * POST /wishlist (120 req / min / user)
   */
  @Throttle({ wishlist: { limit: 120, ttl: 60000 } })
  @Post()
  async addToWishlist(
    @CurrentUser("id") userId: string,
    @Body() dto: AddToWishlistDto,
  ) {
    return this.wishlistService.addToWishlist(userId, dto);
  }

  /**
   * DELETE /wishlist/:productId (120 req / min / user)
   */
  @Throttle({ wishlist: { limit: 120, ttl: 60000 } })
  @Delete(":productId")
  @HttpCode(HttpStatus.OK)
  async removeFromWishlist(
    @CurrentUser("id") userId: string,
    @Param() params: WishlistProductIdParamDto,
    @Query("variantId") variantId?: string,
  ) {
    return this.wishlistService.removeFromWishlist(userId, params.productId, variantId);
  }

  /**
   * POST /wishlist/:productId/move-to-cart (120 req / min / user)
   */
  @Throttle({ wishlist: { limit: 120, ttl: 60000 } })
  @Post(":productId/move-to-cart")
  @HttpCode(HttpStatus.OK)
  async moveToCart(
    @CurrentUser("id") userId: string,
    @Param() params: WishlistProductIdParamDto,
    @Body() dto: MoveToCartDto,
    @Query("variantId") variantId?: string,
  ) {
    return this.wishlistService.moveToCart(
      userId,
      params.productId,
      dto.quantity,
      variantId,
    );
  }
}
