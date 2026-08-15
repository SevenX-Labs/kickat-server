import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ValidateAddressDto } from './dto/validate-address.dto';
import {
  CheckoutPaymentMethodEnum,
  PlaceOrderDto,
} from './dto/place-order.dto';

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /checkout
   */
  async getCheckout(userId: string) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
        variant: true,
      },
    });

    if (cartItems.length === 0) {
      throw new ConflictException('Cart is empty');
    }

    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });

    let subtotal = 0;
    for (const item of cartItems) {
      const price = item.variant
        ? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      subtotal += price * item.quantity;
    }

    const deliveryFee = subtotal > 500 ? 0 : 49;
    const grandTotal = subtotal + deliveryFee;

    // Trigger/Upsert 10-minute stock reservation
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const stockReservation = await this.prisma.stockReservation.create({
      data: {
        userId,
        expiresAt,
      },
    });

    return {
      success: true,
      summary: {
        itemCount: cartItems.reduce((acc, i) => acc + i.quantity, 0),
        subtotal,
        deliveryFee,
        grandTotal,
      },
      addresses,
      paymentMethods: ['UPI', 'CARD', 'WALLET', 'NETBANKING', 'COD'],
      stockReservation: {
        reservationId: stockReservation.id,
        expiresAt: stockReservation.expiresAt,
      },
    };
  }

  /**
   * POST /checkout/validate-address
   */
  async validateAddress(userId: string, dto: ValidateAddressDto) {
    let targetAddress: any = null;

    if (dto.addressId) {
      targetAddress = await this.prisma.address.findFirst({
        where: { id: dto.addressId, userId },
      });
      if (!targetAddress) {
        throw new NotFoundException('Address not found');
      }
    } else if (dto.address) {
      targetAddress = dto.address;
    } else {
      throw new BadRequestException(
        'Either addressId or address payload must be provided',
      );
    }

    const pincode = targetAddress.pincode;
    if (!pincode || pincode.startsWith('0') || pincode.length !== 6) {
      throw new BadRequestException('Unserviceable pincode');
    }

    return {
      success: true,
      serviceable: true,
      deliveryCharge: 49,
      estimatedDays: '2-3 business days',
      address: targetAddress,
    };
  }

  /**
   * GET /checkout/payment-methods
   */
  async getPaymentMethods(orderAmount: number, pincode: string) {
    if (!orderAmount || orderAmount <= 0) {
      throw new BadRequestException('orderAmount must be a positive number');
    }

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      throw new BadRequestException('pincode must be exactly 6 digits');
    }

    const codAvailable = orderAmount <= 5000 && !pincode.startsWith('9');

    return {
      success: true,
      orderAmount,
      pincode,
      methods: [
        { type: 'UPI', name: 'UPI / QR Code', available: true },
        { type: 'CARD', name: 'Credit / Debit Card', available: true },
        { type: 'WALLET', name: 'Digital Wallets', available: true },
        { type: 'NETBANKING', name: 'Net Banking', available: true },
        {
          type: 'COD',
          name: 'Cash on Delivery',
          available: codAvailable,
          reason: codAvailable
            ? undefined
            : 'COD not available for order amount > ₹5000 or remote pincode',
        },
      ],
    };
  }

  /**
   * POST /checkout/place-order
   */
  async placeOrder(
    userId: string,
    idempotencyKey: string,
    dto: PlaceOrderDto,
  ) {
    if (!idempotencyKey || !/^[a-fA-F0-9-]{36}$/.test(idempotencyKey)) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be a valid UUID v4',
      );
    }

    // Persistent database idempotency check
    const existingOrder = await this.prisma.order.findUnique({
      where: { idempotencyKey },
    });

    if (existingOrder) {
      if (existingOrder.userId !== userId) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        success: true,
        message: 'Order already placed (idempotent response)',
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        status: existingOrder.orderStatus,
        grandTotal: existingOrder.grandTotal,
      };
    }

    // Check stock reservation
    const reservation = await this.prisma.stockReservation.findFirst({
      where: {
        userId,
        isFulfilled: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reservation) {
      throw new ConflictException('stock_reservation_expired');
    }

    // Fetch user cart
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true, variant: true },
    });

    if (cartItems.length === 0) {
      throw new ConflictException('Cart is empty or changed');
    }

    // Address check
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Payment method configuration validation
    if (dto.paymentMethod === CheckoutPaymentMethodEnum.UPI && !dto.upiId) {
      throw new UnprocessableEntityException('upiId is required for UPI payment');
    }
    if (
      dto.paymentMethod === CheckoutPaymentMethodEnum.CARD &&
      !dto.savedCardId
    ) {
      throw new UnprocessableEntityException(
        'savedCardId is required for card payment',
      );
    }
    if (
      dto.paymentMethod === CheckoutPaymentMethodEnum.WALLET &&
      !dto.walletProvider
    ) {
      throw new UnprocessableEntityException(
        'walletProvider is required for wallet payment',
      );
    }
    if (
      dto.paymentMethod === CheckoutPaymentMethodEnum.NETBANKING &&
      !dto.bankCode
    ) {
      throw new UnprocessableEntityException(
        'bankCode is required for NetBanking payment',
      );
    }

    // Calculate subtotal and build items payload
    let subtotal = 0;
    const orderItemDataList: any[] = [];

    for (const item of cartItems) {
      const price = item.variant
        ? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      const totalPrice = price * item.quantity;
      subtotal += totalPrice;

      orderItemDataList.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price,
        totalPrice,
        productName: item.product.name,
        variantName: item.variant ? item.variant.name : null,
      });
    }

    const deliveryFee = subtotal > 500 ? 0 : 49;
    const grandTotal = subtotal + deliveryFee;
    const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // Execute atomic stock deduction, order creation, cart clearing, and reservation fulfillment in one transaction
      const order = await this.prisma.$transaction(async (tx) => {
        // 1. Atomic conditional stock deduction for each item in the order
        for (const item of cartItems) {
          if (item.variantId) {
            const updated = await tx.productVariant.updateMany({
              where: {
                id: item.variantId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            });

            if (updated.count === 0) {
              throw new ConflictException(
                `Insufficient stock for ${item.product.name} (${item.variant?.name || 'selected variant'})`,
              );
            }
          } else {
            const updated = await tx.product.updateMany({
              where: {
                id: item.productId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            });

            if (updated.count === 0) {
              throw new ConflictException(
                `Insufficient stock for ${item.product.name}`,
              );
            }
          }
        }

        // 2. Create the order
        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            userId,
            addressId: dto.addressId,
            paymentMethod: dto.paymentMethod as any,
            paymentStatus:
              dto.paymentMethod === CheckoutPaymentMethodEnum.COD
                ? 'PENDING'
                : 'COMPLETED',
            orderStatus: 'PLACED',
            subtotal,
            deliveryFee,
            grandTotal,
            idempotencyKey,
            deliveryInstructions: dto.deliveryInstructions,
            items: {
              create: orderItemDataList,
            },
          },
        });

        // 3. Clear user cart
        await tx.cartItem.deleteMany({ where: { userId } });

        // 4. Mark stock reservation fulfilled
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { isFulfilled: true },
        });

        return createdOrder;
      });

      return {
        success: true,
        message: 'Order placed successfully',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        grandTotal: order.grandTotal,
      };
    } catch (error: any) {
      // Handle concurrent P2002 race on unique idempotencyKey gracefully
      if (
        error?.code === 'P2002' ||
        (typeof error?.message === 'string' &&
          error.message.includes('Unique constraint failed on the fields: (`idempotencyKey`)'))
      ) {
        const concurrentOrder = await this.prisma.order.findUnique({
          where: { idempotencyKey },
        });
        if (concurrentOrder && concurrentOrder.userId === userId) {
          return {
            success: true,
            message: 'Order already placed (idempotent response)',
            orderId: concurrentOrder.id,
            orderNumber: concurrentOrder.orderNumber,
            status: concurrentOrder.orderStatus,
            grandTotal: concurrentOrder.grandTotal,
          };
        }
      }
      throw error;
    }
  }
}
