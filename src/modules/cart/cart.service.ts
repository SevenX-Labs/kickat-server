import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { BuyNowDto } from './dto/buy-now.dto';
import { AddGuestCartItemDto } from './dto/guest-cart-item.dto';

export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function calculateFeesHelper(
  subtotal: number,
  delivery: any,
  tax: any,
  applyOptionalExtraFee: boolean = false,
) {
  if (subtotal <= 0) {
    return {
      subtotal: 0,
      deliveryFee: 0,
      freeDeliveryThreshold: Number(delivery?.freeDeliveryThreshold ?? 0),
      gstPercentage: 0,
      gstAmount: 0,
      extraFeeName: null,
      extraFeeAmount: 0,
      isExtraFeeCompulsory: Boolean(delivery?.isExtraFeeCompulsory ?? true),
      grandTotal: 0,
    };
  }

  let deliveryFee = 0;
  const threshold = Number(delivery?.freeDeliveryThreshold ?? 0);
  if (delivery?.deliveryFeeEnabled) {
    if (threshold > 0 && subtotal >= threshold) {
      deliveryFee = 0;
    } else {
      deliveryFee = Number(delivery?.deliveryFee ?? 0);
    }
  }

  const gstPercentage = tax?.gstEnabled ? Number(tax?.gstPercentage ?? 0) : 0;
  const taxableBase = tax?.gstAppliesToDelivery ? (subtotal + deliveryFee) : subtotal;
  const gstAmount = gstPercentage > 0
    ? roundCurrency((taxableBase * gstPercentage) / 100)
    : 0;

  let extraFeeAmount = 0;
  let extraFeeName: string | null = null;
  const configuredExtraFee = Number(delivery?.extraFeeAmount ?? 0);
  if (delivery?.extraFeeEnabled && configuredExtraFee > 0) {
    const isCompulsory = Boolean(delivery?.isExtraFeeCompulsory ?? true);
    if (isCompulsory || applyOptionalExtraFee) {
      extraFeeAmount = configuredExtraFee;
      extraFeeName = delivery?.extraFeeName || "Handling Fee";
    }
  }

  const grandTotal = roundCurrency(subtotal + deliveryFee + gstAmount + extraFeeAmount);

  return {
    subtotal: roundCurrency(subtotal),
    deliveryFee: roundCurrency(deliveryFee),
    freeDeliveryThreshold: threshold,
    gstPercentage,
    gstAppliesToDelivery: Boolean(tax?.gstAppliesToDelivery),
    gstAmount: roundCurrency(gstAmount),
    extraFeeName,
    extraFeeAmount: roundCurrency(extraFeeAmount),
    isExtraFeeCompulsory: Boolean(delivery?.isExtraFeeCompulsory ?? true),
    grandTotal,
  };
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

    private async validateProductAndVariant(productId: string, variantId?: string | null) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.deletedAt !== null || product.status !== "ACTIVE") {
      throw new NotFoundException("Product not found or is unavailable");
    }

    const variantCount = await this.prisma.productVariant.count({
      where: { productId },
    });

    const isVariable = product.type === "VARIABLE" || variantCount > 0;

    if (!isVariable) {
      if (variantId) {
        throw new BadRequestException("Simple products do not accept variantId");
      }
      return { product, variant: null, availableStock: product.stock };
    }

    if (!variantId) {
      throw new BadRequestException("Variant selection is required for variable products");
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException("Product variant not found");
    }

    if (variant.productId !== productId) {
      throw new BadRequestException("Variant does not belong to the specified product");
    }

    return { product, variant, availableStock: variant.stock };
  }

  public async computeCartFees(subtotal: number, applyOptionalExtraFee: boolean = false) {
    const [delivery, tax] = await Promise.all([
      this.settingsService.getDeliverySettingsRaw(),
      this.settingsService.getTaxSettingsRaw(),
    ]);

    return calculateFeesHelper(subtotal, delivery, tax, applyOptionalExtraFee);
  }

  private async computeDeliveryFee(subtotal: number): Promise<number> {
    const fees = await this.computeCartFees(subtotal);
    return fees.deliveryFee;
  }

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
        ? item.variant.discountPrice ?? item.variant.price
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

    const fees = await this.computeCartFees(subtotal);

    return {
      success: true,
      summary: {
        itemCount: items.reduce((acc, item) => acc + item.quantity, 0),
        productDiscount: Math.max(0, originalTotal - subtotal),
        ...fees,
      },
      items: formattedItems,
    };
  }

  /**
   * POST /cart/items
   */
  async addCartItem(userId: string, dto: AddCartItemDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than 0");
    }

    const { availableStock } = await this.validateProductAndVariant(
      dto.productId,
      dto.variantId,
    );

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
    if (dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than 0");
    }

    const { product, variant: variantObj, availableStock } = await this.validateProductAndVariant(
      dto.productId,
      dto.variantId,
    );
    const unitPrice = variantObj
      ? variantObj.discountPrice ?? variantObj.price
      : product.discountPrice ?? product.price;

    if (dto.quantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    const subtotal = unitPrice * dto.quantity;
    const fees = await this.computeCartFees(subtotal);

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
        ...fees,
      },
    };
  }

  /**
   * POST /cart/guest
   */
  async addGuestCartItem(dto: AddGuestCartItemDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than 0");
    }

    const { availableStock } = await this.validateProductAndVariant(
      dto.productId,
      dto.variantId,
    );

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
        variant: { select: { id: true, name: true, price: true, discountPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let subtotal = 0;
    const formattedItems = items.map((item) => {
      const unitPrice = item.variant
        ? item.variant.discountPrice ?? item.variant.price
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

    const fees = await this.computeCartFees(subtotal);

    return {
      success: true,
      sessionId,
      summary: {
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        ...fees,
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
