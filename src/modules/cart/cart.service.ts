import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { BuyNowDto } from './dto/buy-now.dto';
import { AddGuestCartItemDto } from './dto/guest-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /cart
   */
  async getCart(userId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        variant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let subtotal = 0;
    let originalTotal = 0;

    const formattedItems = items.map((item) => {
      const unitPrice = item.variant
        ? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      const originalUnitPrice = item.variant
        ? item.variant.price
        : item.product.price;

      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;
      originalTotal += originalUnitPrice * item.quantity;

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          price: item.product.price,
          discountPrice: item.product.discountPrice,
          imageUrl: item.product.imageUrl,
          stock: item.product.stock,
          category: item.product.category,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              price: item.variant.price,
              stock: item.variant.stock,
            }
          : null,
      };
    });

    const deliveryFee = subtotal > 500 || subtotal === 0 ? 0 : 49;
    const grandTotal = subtotal + deliveryFee;

    return {
      success: true,
      summary: {
        itemCount: items.reduce((acc, item) => acc + item.quantity, 0),
        subtotal,
        productDiscount: Math.max(0, originalTotal - subtotal),
        deliveryFee,
        grandTotal,
      },
      items: formattedItems,
    };
  }

  /**
   * POST /cart/items
   */
  async addCartItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let availableStock = product.stock;
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId },
      });
      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }
      availableStock = variant.stock;
    }

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        userId,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
      },
    });

    const newQuantity = existing
      ? existing.quantity + dto.quantity
      : dto.quantity;

    if (newQuantity > 100) {
      throw new ConflictException(
        'Maximum allowed item quantity (100) exceeded',
      );
    }

    if (newQuantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          userId,
          productId: dto.productId,
          variantId: dto.variantId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  /**
   * PUT /cart/items/:itemId
   */
  async updateCartItem(userId: string, itemId: string, quantity: number) {
    const existing = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
      include: { product: true, variant: true },
    });

    if (!existing) {
      throw new NotFoundException('Cart item not found');
    }

    const availableStock = existing.variant
      ? existing.variant.stock
      : existing.product.stock;

    if (quantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  /**
   * DELETE /cart/items/:itemId
   */
  async removeCartItem(userId: string, itemId: string) {
    const existing = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return {
      success: true,
      message: 'Item removed from cart successfully',
    };
  }

  /**
   * POST /cart/buy-now
   */
  async buyNow(userId: string, dto: BuyNowDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let availableStock = product.stock;
    let unitPrice = product.discountPrice ?? product.price;
    let variantObj: any = null;

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId },
      });
      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }
      availableStock = variant.stock;
      unitPrice = variant.price;
      variantObj = variant;
    }

    if (dto.quantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    const subtotal = unitPrice * dto.quantity;
    const deliveryFee = subtotal > 500 ? 0 : 49;
    const grandTotal = subtotal + deliveryFee;

    return {
      success: true,
      message: 'Buy now session created successfully',
      buyNowItem: {
        productId: product.id,
        productName: product.name,
        variantId: dto.variantId ?? null,
        variantName: variantObj ? variantObj.name : null,
        quantity: dto.quantity,
        unitPrice,
        subtotal,
        deliveryFee,
        grandTotal,
      },
    };
  }

  /**
   * POST /cart/guest
   */
  async addGuestCartItem(dto: AddGuestCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let availableStock = product.stock;
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId },
      });
      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }
      availableStock = variant.stock;
    }

    const existing = await this.prisma.guestCartItem.findFirst({
      where: {
        sessionId: dto.guestSessionId,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
      },
    });

    const newQuantity = existing
      ? existing.quantity + dto.quantity
      : dto.quantity;

    if (newQuantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    if (existing) {
      await this.prisma.guestCartItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.guestCartItem.create({
        data: {
          sessionId: dto.guestSessionId,
          productId: dto.productId,
          variantId: dto.variantId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getGuestCart(dto.guestSessionId);
  }

  /**
   * GET /cart/guest/:sessionId
   */
  async getGuestCart(sessionId: string) {
    const items = await this.prisma.guestCartItem.findMany({
      where: { sessionId },
      include: {
        product: { select: { id: true, name: true, price: true, discountPrice: true, imageUrl: true } },
        variant: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let subtotal = 0;
    const formattedItems = items.map((item) => {
      const unitPrice = item.variant
        ? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        product: item.product,
        variant: item.variant,
      };
    });

    const deliveryFee = subtotal > 500 || subtotal === 0 ? 0 : 49;

    return {
      success: true,
      sessionId,
      summary: {
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        subtotal,
        deliveryFee,
        grandTotal: subtotal + deliveryFee,
      },
      items: formattedItems,
    };
  }

  /**
   * POST /cart/merge
   */
  async mergeCart(userId: string, guestSessionId: string) {
    const guestItems = await this.prisma.guestCartItem.findMany({
      where: { sessionId: guestSessionId },
    });

    if (guestItems.length === 0) {
      return this.getCart(userId);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of guestItems) {
        const existing = await tx.cartItem.findFirst({
          where: {
            userId,
            productId: item.productId,
            variantId: item.variantId,
          },
        });

        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: Math.min(100, existing.quantity + item.quantity) },
          });
        } else {
          await tx.cartItem.create({
            data: {
              userId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            },
          });
        }
      }

      await tx.guestCartItem.deleteMany({
        where: { sessionId: guestSessionId },
      });
    });

    return this.getCart(userId);
  }
}
