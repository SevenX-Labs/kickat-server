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
   * GET /checkout/delivery-slots
   */
  async getDeliverySlots(pincode: string, date?: string) {
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      throw new BadRequestException('Invalid pincode format');
    }

    const baseDate = date ? new Date(date) : new Date();
    if (isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid ISO date string');
    }

    const slots = [
      {
        date: baseDate.toISOString().split('T')[0],
        slot: 'MORNING',
        label: '9:00 AM - 1:00 PM',
        available: true,
      },
      {
        date: baseDate.toISOString().split('T')[0],
        slot: 'EVENING',
        label: '4:00 PM - 8:00 PM',
        available: true,
      },
      {
        date: baseDate.toISOString().split('T')[0],
        slot: 'STANDARD',
        label: 'Standard Day Delivery (9 AM - 9 PM)',
        available: true,
      },
    ];

    return {
      success: true,
      pincode,
      slots,
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

    // Idempotency check
    const existingOrder = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: { items: true },
    });

    if (existingOrder) {
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

    // Stock verification
    let subtotal = 0;
    const orderItemDataList: any[] = [];

    for (const item of cartItems) {
      const availableStock = item.variant
        ? item.variant.stock
        : item.product.stock;

      if (availableStock < item.quantity) {
        throw new ConflictException(
          `Insufficient stock for ${item.product.name}`,
        );
      }

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

    // Create order and clear cart in transaction
    const order = await this.prisma.$transaction(async (tx) => {
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
          deliveryDate: new Date(dto.deliverySlot.date),
          deliverySlot: dto.deliverySlot.slot,
          deliveryInstructions: dto.deliveryInstructions,
          items: {
            create: orderItemDataList,
          },
        },
      });

      // Clear user cart
      await tx.cartItem.deleteMany({ where: { userId } });

      // Mark reservation fulfilled
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
  }
}
