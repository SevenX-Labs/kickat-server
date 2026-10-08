import { StockAlertService } from "../notifications/stock-alert.service";
import { NotificationsService } from "../notifications/notifications.service";
import { calculateFeesHelper, roundCurrency } from "../cart/cart.service";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentMethodType } from '../payments/dto/create-payment-order.dto';
import { ShippingService } from '../admin/shipping/shipping.service'; import { Optional } from '@nestjs/common';
import { ValidateAddressDto } from './dto/validate-address.dto';
import {
  CheckoutPaymentMethodEnum,
  PlaceOrderDto,
} from './dto/place-order.dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly stockAlertService: StockAlertService,
    @Optional() private readonly shippingService?: ShippingService,
    @Optional() private readonly paymentsService?: PaymentsService,
  ) {}

  /**
   * Issue 2: an online payment order is created hidden (PENDING) and the
   * Razorpay order is prepared here, so the client can open the gateway
   * straight from the place-order response.
   *
   * Returns null when no gateway order could be prepared; the client then
   * falls back to POST /payments/create-order, which keeps the previous
   * two-call flow working.
   */
  private async prepareOnlinePayment(
    userId: string,
    order: { id: string; grandTotal: number },
    dto: PlaceOrderDto,
  ) {
    if (!this.paymentsService) {
      return null;
    }

    try {
      // Reuse a still-open gateway attempt: idempotent replays of
      // place-order and the "try again" button must not create a second
      // Razorpay order for the same pending order.
      const existing = await this.prisma.payment.findFirst({
        where: {
          orderId: order.id,
          userId,
          status: 'PENDING',
          razorpayOrderId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return {
          paymentId: existing.id,
          razorpayOrderId: existing.razorpayOrderId,
          amount: existing.amount,
          currency: existing.currency,
          status: existing.status,
          paymentMethod: existing.paymentMethod.toLowerCase(),
          key: this.paymentsService.getGatewayKeyId(),
        };
      }

      const created = await this.paymentsService.createPaymentOrder(
        userId,
        randomUUID(),
        {
          orderId: order.id,
          paymentMethod:
            dto.paymentMethod.toLowerCase() as PaymentMethodType,
          upiId: dto.upiId,
          savedCardId: dto.savedCardId,
          walletProvider: dto.walletProvider?.toLowerCase(),
          bankCode: dto.bankCode,
        },
      );

      return {
        paymentId: created.paymentId,
        razorpayOrderId: created.razorpayOrderId,
        amount: created.amount,
        currency: created.currency,
        status: created.status,
        paymentMethod: created.paymentMethod,
        key: created.key,
      };
    } catch (err: any) {
      this.logger.error(
        `Could not prepare gateway payment for order ${order.id}: ${err?.message || err}`,
      );
      return null;
    }
  }

  private async computeFees(
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
    const fees = await this.computeFees(subtotal);
    return fees.deliveryFee;
  }

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
        ? item.variant.discountPrice ?? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      subtotal += price * item.quantity;
    }

    const fees = await this.computeFees(subtotal);

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
        ...fees,
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

    const delivery = await this.settingsService.getDeliverySettingsRaw();
    const threshold = delivery.freeDeliveryThreshold ?? 0;
    const deliveryCharge = delivery.deliveryFeeEnabled ? (threshold === 0 ? 0 : (delivery.deliveryFee ?? 0)) : 0;

    return {
      success: true,
      serviceable: true,
      deliveryCharge,
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

    const paymentSettings = await this.settingsService.getPaymentSettingsRaw();

    const codEnabled = Boolean(paymentSettings.cod?.enabled ?? true);
    const upiEnabled = Boolean(paymentSettings.upi?.enabled ?? true);
    const cardEnabled = Boolean(paymentSettings.card?.enabled ?? true);
    const codExtraFeeEnabled = paymentSettings.cod?.extraFeeEnabled !== false;
    const codExtraFee = (codExtraFeeEnabled && codEnabled) ? Number(paymentSettings.cod?.extraFee ?? 0) : 0;

    return {
      success: true,
      orderAmount,
      pincode,
      methods: [
        { type: 'UPI', name: 'UPI / QR Code', available: upiEnabled },
        { type: 'CARD', name: 'Credit / Debit Card', available: cardEnabled },
        { type: 'WALLET', name: 'Digital Wallets', available: true },
        { type: 'NETBANKING', name: 'Net Banking', available: true },
        {
          type: 'COD',
          name: 'Cash on Delivery',
          available: codEnabled,
          extraFee: codExtraFee,
          reason: codEnabled ? undefined : 'COD payment method is currently disabled',
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

    const paymentSettings = await this.settingsService.getPaymentSettingsRaw();

    // Check payment method enablement
    if (dto.paymentMethod === CheckoutPaymentMethodEnum.COD && !paymentSettings.cod?.enabled) {
      throw new UnprocessableEntityException('COD payment method is currently disabled');
    }
    if (dto.paymentMethod === CheckoutPaymentMethodEnum.UPI && !paymentSettings.upi?.enabled) {
      throw new UnprocessableEntityException('UPI payment method is currently disabled');
    }
    if (dto.paymentMethod === CheckoutPaymentMethodEnum.CARD && !paymentSettings.card?.enabled) {
      throw new UnprocessableEntityException('Card payment method is currently disabled');
    }

    // Persistent database idempotency check
    const existingOrder = await this.prisma.order.findUnique({
      where: { idempotencyKey },
    });

    const isOnlinePayment =
      dto.paymentMethod !== CheckoutPaymentMethodEnum.COD;

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
        // Additive: an unpaid online order replayed with the same
        // idempotency key hands back the same gateway attempt so the client
        // can re-open Razorpay instead of creating another order.
        ...(isOnlinePayment && existingOrder.orderStatus === 'PENDING'
          ? {
              requiresPayment: true,
              payment: await this.prepareOnlinePayment(
                userId,
                existingOrder,
                dto,
              ),
            }
          : {}),
      };
    }

    // Check stock reservation
    let reservation = await this.prisma.stockReservation.findFirst({
      where: {
        userId,
        isFulfilled: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reservation) {
      // Auto-provision a 10-minute stock reservation if missing/expired
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      reservation = await this.prisma.stockReservation.create({
        data: {
          userId,
          expiresAt,
        },
      });
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

    // Payment method payload validation (optional gateway details)
    if (dto.paymentMethod === CheckoutPaymentMethodEnum.UPI && !dto.upiId) {
      // Default UPI identifier if missing
      dto.upiId = 'qr@razorpay';
    }

    // Revalidate products and variants & calculate subtotal
    let subtotal = 0;
    const orderItemDataList: any[] = [];

    for (const item of cartItems) {
      if (!item.product || item.product.deletedAt !== null || item.product.status !== "ACTIVE") {
        throw new ConflictException(`Product ${item.product?.name || "in cart"} is no longer available`);
      }

      if (item.variantId) {
        if (!item.variant) {
          throw new ConflictException(`Selected variant for ${item.product.name} is no longer available`);
        }
        if (item.variant.productId !== item.productId) {
          throw new ConflictException(`Variant ${item.variant.name} does not belong to product ${item.product.name}`);
        }
      }

      const price = item.variant
        ? item.variant.discountPrice ?? item.variant.price
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

    // Explicitly re-fetch live system settings at exact moment of order placement
    const fees = await this.computeFees(subtotal, dto.applyExtraFee ?? false, dto.paymentMethod);
    const deliveryFee = fees.deliveryFee;
    const codFee = fees.codFee;
    const grandTotal = fees.grandTotal;

    if (dto.expectedTotal !== undefined && Math.abs(grandTotal - dto.expectedTotal) > 1.0) {
      throw new ConflictException(
        "Cart total has changed due to updated fee settings. Please review your total before completing checkout."
      );
    }
    const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // Execute atomic stock deduction, order creation, cart clearing, and reservation fulfillment in one transaction
      const stockChangeEvents: Array<{ productId: string; variantId?: string | null; previousStock: number; newStock: number; productName?: string; variantName?: string | null }> = [];
      const order = await this.prisma.$transaction(async (tx) => {
        // 1. Stock.
        //
        // Online payments (UPI/card/wallet/netbanking): the order is created
        // hidden and unpaid, so stock must NOT be taken here — an abandoned
        // Razorpay screen would otherwise strand it. Availability is still
        // checked so the customer is not sent to the gateway for an
        // out-of-stock cart. The real deduction happens once the payment is
        // confirmed (PaymentsService.promoteOrderAfterPayment), covered by the
        // stock reservation in the meantime.
        //
        // COD: unchanged — deduct atomically at placement.
        if (isOnlinePayment) {
          for (const item of cartItems) {
            const available = item.variantId
              ? (
                  await tx.productVariant.findUnique({
                    where: { id: item.variantId },
                    select: { stock: true },
                  })
                )?.stock ?? 0
              : (
                  await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { stock: true },
                  })
                )?.stock ?? 0;

            if (available < item.quantity) {
              throw new ConflictException(
                item.variantId
                  ? `Insufficient stock for ${item.product.name} (${item.variant?.name || 'selected variant'})`
                  : `Insufficient stock for ${item.product.name}`,
              );
            }
          }
        }

        for (const item of isOnlinePayment ? [] : cartItems) {
          if (item.variantId) {
            const currentVariant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
              select: { stock: true, name: true, product: { select: { name: true } } },
            });
            const prevStock = currentVariant ? currentVariant.stock : 0;

            const updated = await tx.productVariant.updateMany({
              where: {
                id: item.variantId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            });

            if (updated.count > 0) {
              stockChangeEvents.push({
                productId: item.productId,
                variantId: item.variantId,
                previousStock: prevStock,
                newStock: prevStock - item.quantity,
                productName: item.product.name,
                variantName: item.variant?.name,
              });
            }

            if (updated.count === 0) {
              throw new ConflictException(
                `Insufficient stock for ${item.product.name} (${item.variant?.name || 'selected variant'})`,
              );
            }
          } else {
            const currentProduct = await tx.product.findUnique({
              where: { id: item.productId },
              select: { stock: true, name: true },
            });
            const prevStock = currentProduct ? currentProduct.stock : 0;

            const updated = await tx.product.updateMany({
              where: {
                id: item.productId,
                stock: { gte: item.quantity },
              },
              data: {
                stock: { decrement: item.quantity },
              },
            });

            if (updated.count > 0) {
              stockChangeEvents.push({
                productId: item.productId,
                previousStock: prevStock,
                newStock: prevStock - item.quantity,
                productName: item.product.name,
              });
            }

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
            paymentStatus: 'PENDING',
            // Hidden until the gateway confirms payment; COD stays visible.
            orderStatus: isOnlinePayment ? 'PENDING' : 'PLACED',
            subtotal,
            deliveryFee,
            codFee,
            gstPercentage: fees.gstPercentage,
            gstAmount: fees.gstAmount,
            extraFeeName: fees.extraFeeName,
            extraFeeAmount: fees.extraFeeAmount,
            grandTotal,
            idempotencyKey,
            deliveryInstructions: dto.deliveryInstructions,
            items: {
              create: orderItemDataList,
            },
          },
        });

        // 3. Clear user cart — only for COD. For an online payment the cart is
        // kept until the payment is confirmed, so a cancelled/abandoned
        // Razorpay screen leaves the customer's cart intact to retry with.
        if (!isOnlinePayment) {
          await tx.cartItem.deleteMany({ where: { userId } });

          // 4. Mark stock reservation fulfilled
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { isFulfilled: true },
          });
        }

        return createdOrder;
      });

      // An online order is not "placed" yet: no notification, no shipment.
      // Both happen on payment confirmation.
      if (isOnlinePayment) {
        const payment = await this.prepareOnlinePayment(userId, order, dto);

        return {
          success: true,
          message: 'Order created. Complete payment to confirm.',
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          grandTotal: order.grandTotal,
          requiresPayment: true,
          payment,
        };
      }

      this.notificationsService.notifyOrderPlaced({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
      });

      if (this.shippingService) {
        try {
          await this.shippingService.createShipmentForOrder(order.id);
        } catch (shippingErr: any) {
          this.logger.error(
            `Automatic shipping workflow error for order ${order.orderNumber}: ${shippingErr?.message || shippingErr}`,
          );
        }
      }

      return {
        success: true,
        message: 'Order placed successfully',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        grandTotal: order.grandTotal,
      };
    } catch (error: any) {
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
            ...(isOnlinePayment && concurrentOrder.orderStatus === 'PENDING'
              ? {
                  requiresPayment: true,
                  payment: await this.prepareOnlinePayment(
                    userId,
                    concurrentOrder,
                    dto,
                  ),
                }
              : {}),
          };
        }
      }
      throw error;
    }
  }
}
