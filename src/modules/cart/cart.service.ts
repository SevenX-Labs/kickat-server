import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { CartCacheService, CartItemEntry } from './cart-cache.service';
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
  paymentMethod?: string,
  paymentSettings?: any,
) {
  if (subtotal <= 0) {
    return {
      subtotal: 0,
      deliveryFee: 0,
      freeDeliveryThreshold: Number(delivery?.freeDeliveryThreshold ?? 0),
      gstPercentage: 0,
      gstAppliesToDelivery: Boolean(tax?.gstAppliesToDelivery),
      gstAmount: 0,
      extraFeeName: null,
      extraFeeAmount: 0,
      isExtraFeeCompulsory: Boolean(delivery?.isExtraFeeCompulsory ?? true),
      codFee: 0,
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

  let codFee = 0;
  const isCod = paymentMethod === "COD" || paymentMethod === "cod";
  const codExtraFeeEnabled = paymentSettings?.cod?.extraFeeEnabled !== false;
  if (isCod && paymentSettings?.cod?.enabled && codExtraFeeEnabled && Number(paymentSettings?.cod?.extraFee ?? 0) > 0) {
    codFee = Number(paymentSettings.cod.extraFee);
  }

  const gstPercentage = tax?.gstEnabled ? Number(tax?.gstPercentage ?? 0) : 0;
  const taxableBase = tax?.gstAppliesToDelivery ? (subtotal + deliveryFee) : subtotal;
  const gstAmount = gstPercentage > 0
    ? roundCurrency((taxableBase * gstPercentage) / 100)
    : 0;

  let extraFeeAmount = 0;
  let extraFeeName: string | null = null;
  const configuredExtraFee = Number(delivery?.extraFeeAmount ?? 0);
  if (delivery?.extraFeeEnabled) {
    if (!delivery?.extraFeeName || !delivery.extraFeeName.trim()) {
      throw new BadRequestException('extraFeeName is required when extra fee is enabled');
    }
  }
  if (delivery?.extraFeeEnabled && configuredExtraFee > 0) {
    const isCompulsory = Boolean(delivery?.isExtraFeeCompulsory ?? true);
    if (isCompulsory || applyOptionalExtraFee) {
      extraFeeAmount = configuredExtraFee;
      extraFeeName = delivery?.extraFeeName || null;
    }
  }

  const grandTotal = roundCurrency(subtotal + deliveryFee + gstAmount + extraFeeAmount + codFee);

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
    codFee: roundCurrency(codFee),
    grandTotal,
  };
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly cartCache: CartCacheService,
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

  public async computeCartFees(
    subtotal: number,
    applyOptionalExtraFee: boolean = false,
    paymentMethod?: string,
  ) {
    const [delivery, tax, payment] = await Promise.all([
      this.settingsService.getDeliverySettingsRaw(),
      this.settingsService.getTaxSettingsRaw(),
      this.settingsService.getPaymentSettingsRaw(),
    ]);

    return calculateFeesHelper(
      subtotal,
      delivery,
      tax,
      applyOptionalExtraFee,
      paymentMethod,
      payment,
    );
  }

  private async computeDeliveryFee(subtotal: number): Promise<number> {
    const fees = await this.computeCartFees(subtotal);
    return fees.deliveryFee;
  }

  private async enrichCartItems(entries: CartItemEntry[]) {
    const productIds = [...new Set(entries.map((e) => e.productId))];
    const variantIds = entries
      .filter((e) => e.variantId)
      .map((e) => e.variantId as string);

    const [products, variants] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
      variantIds.length > 0
        ? this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve([]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p] as const));
    const variantMap = new Map(variants.map((v: any) => [v.id, v] as const));

    let subtotal = 0;
    let originalTotal = 0;
    const staleFieldKeys: string[] = [];

    const formattedItems = entries
      .map((entry) => {
        const product = productMap.get(entry.productId);
        if (!product || product.deletedAt !== null || product.status !== 'ACTIVE') {
          staleFieldKeys.push(CartCacheService.fieldKey(entry.productId, entry.variantId));
          return null;
        }

        const variant = entry.variantId ? variantMap.get(entry.variantId) : null;
        if (entry.variantId && !variant) {
          staleFieldKeys.push(CartCacheService.fieldKey(entry.productId, entry.variantId));
          return null;
        }

        const unitPrice = variant
          ? (variant as any).discountPrice ?? (variant as any).price
          : product.discountPrice ?? product.price;
        const originalUnitPrice = variant ? (variant as any).price : product.price;
        const itemTotal = unitPrice * entry.quantity;
        subtotal += itemTotal;
        originalTotal += originalUnitPrice * entry.quantity;

        return {
          id: entry.id,
          productId: entry.productId,
          variantId: entry.variantId,
          quantity: entry.quantity,
          unitPrice,
          totalPrice: itemTotal,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            discountPrice: product.discountPrice,
            imageUrl: product.imageUrl,
            images: product.images,
            stock: product.stock,
            category: product.category,
          },
          variant: variant
            ? {
                id: (variant as any).id,
                name: (variant as any).name,
                price: (variant as any).price,
                discountPrice: (variant as any).discountPrice,
                stock: (variant as any).stock,
                imageUrl: (variant as any).imageUrl,
                images: (variant as any).images,
              }
            : null,
        };
      })
      .filter(Boolean);

    return { formattedItems, subtotal, originalTotal, staleFieldKeys };
  }

  private async warmCartCache(
    key: string,
    items: Array<{ id: string; productId: string; variantId: string | null; quantity: number; createdAt?: Date }>,
    isGuest: boolean,
  ) {
    for (const item of items) {
      const fieldKey = CartCacheService.fieldKey(item.productId, item.variantId);
      await this.cartCache.setItem(key, fieldKey, {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        addedAt: item.createdAt?.toISOString() || new Date().toISOString(),
      }, isGuest);
    }
  }

  /**
   * GET /cart — Redis-first with DB fallback
   */
  async getCart(userId: string) {
    const cacheKey = CartCacheService.cartKey(userId);
    const cachedItems = await this.cartCache.getCart(cacheKey);

    if (cachedItems) {
      const { formattedItems, subtotal, originalTotal, staleFieldKeys } =
        await this.enrichCartItems(cachedItems);

      if (staleFieldKeys.length > 0) {
        await this.cartCache.removeItems(cacheKey, staleFieldKeys);
      }

      const fees = await this.computeCartFees(subtotal);
      return {
        success: true,
        summary: {
          itemCount: formattedItems.reduce((acc, i: any) => acc + i.quantity, 0),
          productDiscount: Math.max(0, originalTotal - subtotal),
          ...fees,
        },
        items: formattedItems,
      };
    }

    // DB fallback
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

    // Warm the cache from DB
    if (items.length > 0) {
      await this.warmCartCache(cacheKey, items, false);
    }

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
          images: item.product.images,
          stock: item.product.stock,
          category: item.product.category,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              price: item.variant.price,
              discountPrice: item.variant.discountPrice,
              stock: item.variant.stock,
              imageUrl: item.variant.imageUrl,
              images: item.variant.images,
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
   * POST /cart/items — Redis-first, DB fallback
   */
  async addCartItem(userId: string, dto: AddCartItemDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than 0");
    }

    const { availableStock } = await this.validateProductAndVariant(
      dto.productId,
      dto.variantId,
    );

    const cacheKey = CartCacheService.cartKey(userId);
    const fieldKey = CartCacheService.fieldKey(dto.productId, dto.variantId);

    const existing = await this.cartCache.getItem(cacheKey, fieldKey);
    const newQuantity = existing
      ? existing.quantity + dto.quantity
      : dto.quantity;

    if (newQuantity > 100) {
      throw new ConflictException('Maximum allowed item quantity (100) exceeded');
    }
    if (newQuantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    const wrote = await this.cartCache.setItem(cacheKey, fieldKey, {
      id: existing?.id || randomUUID(),
      productId: dto.productId,
      variantId: dto.variantId || null,
      quantity: newQuantity,
      addedAt: existing?.addedAt || new Date().toISOString(),
    }, false);

    if (!wrote) {
      // Redis failed — fall through to DB
      const dbExisting = await this.prisma.cartItem.findFirst({
        where: { userId, productId: dto.productId, variantId: dto.variantId ?? null },
      });

      const dbNewQty = dbExisting ? dbExisting.quantity + dto.quantity : dto.quantity;
      if (dbNewQty > 100) {
        throw new ConflictException('Maximum allowed item quantity (100) exceeded');
      }
      if (dbNewQty > availableStock) {
        throw new ConflictException('Insufficient stock available');
      }

      if (dbExisting) {
        await this.prisma.cartItem.update({
          where: { id: dbExisting.id },
          data: { quantity: dbNewQty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: { userId, productId: dto.productId, variantId: dto.variantId, quantity: dto.quantity },
        });
      }
    }

    return this.getCart(userId);
  }

  /**
   * PUT /cart/items/:itemId — Redis-first, DB fallback
   */
  async updateCartItem(userId: string, itemId: string, quantity: number) {
    const cacheKey = CartCacheService.cartKey(userId);
    const cachedItems = await this.cartCache.getCart(cacheKey);

    if (cachedItems) {
      const entry = cachedItems.find((e) => e.id === itemId);
      if (!entry) {
        throw new NotFoundException('Cart item not found');
      }

      const { availableStock } = await this.validateProductAndVariant(
        entry.productId,
        entry.variantId,
      );

      if (quantity > availableStock) {
        throw new ConflictException('Insufficient stock available');
      }

      const fieldKey = CartCacheService.fieldKey(entry.productId, entry.variantId);
      await this.cartCache.setItem(cacheKey, fieldKey, {
        ...entry,
        quantity,
      }, false);

      return this.getCart(userId);
    }

    // DB fallback
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
   * DELETE /cart/items/:itemId — Redis-first, DB fallback
   */
  async removeCartItem(userId: string, itemId: string) {
    const cacheKey = CartCacheService.cartKey(userId);
    const cachedItems = await this.cartCache.getCart(cacheKey);

    if (cachedItems) {
      const entry = cachedItems.find((e) => e.id === itemId);
      if (!entry) {
        throw new NotFoundException('Cart item not found');
      }

      const fieldKey = CartCacheService.fieldKey(entry.productId, entry.variantId);
      await this.cartCache.removeItem(cacheKey, fieldKey);

      return { success: true, message: 'Item removed from cart successfully' };
    }

    // DB fallback
    const existing = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    return { success: true, message: 'Item removed from cart successfully' };
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
   * POST /cart/guest — Redis-first, DB fallback
   */
  async addGuestCartItem(dto: AddGuestCartItemDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than 0");
    }

    const { availableStock } = await this.validateProductAndVariant(
      dto.productId,
      dto.variantId,
    );

    const cacheKey = CartCacheService.guestKey(dto.guestSessionId);
    const fieldKey = CartCacheService.fieldKey(dto.productId, dto.variantId);

    const existing = await this.cartCache.getItem(cacheKey, fieldKey);
    const newQuantity = existing
      ? existing.quantity + dto.quantity
      : dto.quantity;

    if (newQuantity > availableStock) {
      throw new ConflictException('Insufficient stock available');
    }

    const wrote = await this.cartCache.setItem(cacheKey, fieldKey, {
      id: existing?.id || randomUUID(),
      productId: dto.productId,
      variantId: dto.variantId || null,
      quantity: newQuantity,
      addedAt: existing?.addedAt || new Date().toISOString(),
    }, true);

    if (!wrote) {
      // Redis failed — fall through to DB
      const dbExisting = await this.prisma.guestCartItem.findFirst({
        where: {
          sessionId: dto.guestSessionId,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
        },
      });

      const dbNewQty = dbExisting ? dbExisting.quantity + dto.quantity : dto.quantity;
      if (dbNewQty > availableStock) {
        throw new ConflictException('Insufficient stock available');
      }

      if (dbExisting) {
        await this.prisma.guestCartItem.update({
          where: { id: dbExisting.id },
          data: { quantity: dbNewQty },
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
    }

    return this.getGuestCart(dto.guestSessionId);
  }

  /**
   * GET /cart/guest/:sessionId — Redis-first with DB fallback
   */
  async getGuestCart(sessionId: string) {
    const cacheKey = CartCacheService.guestKey(sessionId);
    const cachedItems = await this.cartCache.getCart(cacheKey);

    if (cachedItems) {
      const { formattedItems, subtotal, staleFieldKeys } =
        await this.enrichCartItems(cachedItems);

      if (staleFieldKeys.length > 0) {
        await this.cartCache.removeItems(cacheKey, staleFieldKeys);
      }

      const fees = await this.computeCartFees(subtotal);
      return {
        success: true,
        sessionId,
        summary: {
          itemCount: formattedItems.reduce((acc, i: any) => acc + i.quantity, 0),
          ...fees,
        },
        items: formattedItems,
      };
    }

    // DB fallback
    const items = await this.prisma.guestCartItem.findMany({
      where: { sessionId },
      include: {
        product: {
          select: {
            id: true, name: true, price: true, discountPrice: true,
            imageUrl: true, images: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        variant: {
          select: {
            id: true, name: true, price: true, discountPrice: true,
            imageUrl: true, images: true, stock: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Warm the cache from DB
    if (items.length > 0) {
      await this.warmCartCache(cacheKey, items, true);
    }

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
   * POST /cart/merge — Merge guest cart into authenticated cart
   */
  async mergeCart(userId: string, guestSessionId: string) {
    const authKey = CartCacheService.cartKey(userId);
    const guestKey = CartCacheService.guestKey(guestSessionId);

    const guestCached = await this.cartCache.getCart(guestKey);
    const authCached = await this.cartCache.getCart(authKey);

    if (guestCached && guestCached.length > 0) {
      const authMap = new Map<string, CartItemEntry>();
      if (authCached) {
        for (const entry of authCached) {
          authMap.set(CartCacheService.fieldKey(entry.productId, entry.variantId), entry);
        }
      }

      for (const guestEntry of guestCached) {
        const fk = CartCacheService.fieldKey(guestEntry.productId, guestEntry.variantId);
        const existing = authMap.get(fk);
        if (existing) {
          existing.quantity = Math.min(100, existing.quantity + guestEntry.quantity);
        } else {
          authMap.set(fk, { ...guestEntry, id: guestEntry.id });
        }
      }

      for (const [fk, entry] of authMap) {
        await this.cartCache.setItem(authKey, fk, entry, false);
      }

      await this.cartCache.clearCart(guestKey);
    }

    // Also merge in DB for data safety
    const guestItems = await this.prisma.guestCartItem.findMany({
      where: { sessionId: guestSessionId },
    });

    if (guestItems.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of guestItems) {
          const existing = await tx.cartItem.findFirst({
            where: { userId, productId: item.productId, variantId: item.variantId },
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
    }

    return this.getCart(userId);
  }

  /**
   * Sync Redis cart state to PostgreSQL — called before checkout
   */
  async syncCartToDb(userId: string): Promise<void> {
    const cacheKey = CartCacheService.cartKey(userId);
    const cachedItems = await this.cartCache.getCart(cacheKey);
    if (!cachedItems || cachedItems.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { userId } });
      for (const item of cachedItems) {
        await tx.cartItem.create({
          data: {
            userId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          },
        });
      }
    });
  }

  /**
   * Clear the Redis cart — called after successful order placement
   */
  async clearCachedCart(userId: string): Promise<void> {
    await this.cartCache.clearCart(CartCacheService.cartKey(userId));
  }
}
