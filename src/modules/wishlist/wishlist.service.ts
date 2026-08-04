import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WishlistQueryDto } from './dto/wishlist-query.dto';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /wishlist
   */
  async getWishlist(userId: string, query: WishlistQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          variant: true,
        },
      }),
      this.prisma.wishlistItem.count({ where: { userId } }),
    ]);

    return {
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      items,
    };
  }

  /**
   * POST /wishlist
   */
  async addToWishlist(userId: string, dto: AddToWishlistDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId },
      });
      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }
    }

    const existing = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId: dto.productId },
    });

    if (existing) {
      throw new ConflictException('Product already in wishlist');
    }

    const item = await this.prisma.wishlistItem.create({
      data: {
        userId,
        productId: dto.productId,
        variantId: dto.variantId,
      },
      include: {
        product: true,
        variant: true,
      },
    });

    return {
      success: true,
      message: 'Product added to wishlist',
      item,
    };
  }

  /**
   * DELETE /wishlist/:productId
   */
  async removeFromWishlist(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId },
    });

    if (!existing) {
      throw new NotFoundException('Product not in wishlist');
    }

    await this.prisma.wishlistItem.delete({
      where: { id: existing.id },
    });

    return {
      success: true,
      message: 'Product removed from wishlist',
    };
  }

  /**
   * POST /wishlist/:productId/move-to-cart
   */
  async moveToCart(userId: string, productId: string, quantity: number = 1) {
    const wishlistItem = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId },
      include: { product: true, variant: true },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Product not in wishlist');
    }

    const availableStock = wishlistItem.variant
      ? wishlistItem.variant.stock
      : wishlistItem.product.stock;

    if (availableStock < quantity) {
      throw new ConflictException('Product is out of stock');
    }

    // Add or update cart item
    const existingCartItem = await this.prisma.cartItem.findFirst({
      where: {
        userId,
        productId,
        variantId: wishlistItem.variantId,
      },
    });

    if (existingCartItem) {
      await this.prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          userId,
          productId,
          variantId: wishlistItem.variantId,
          quantity,
        },
      });
    }

    // Remove from wishlist
    await this.prisma.wishlistItem.delete({
      where: { id: wishlistItem.id },
    });

    return {
      success: true,
      message: 'Product moved to cart successfully',
    };
  }
}
