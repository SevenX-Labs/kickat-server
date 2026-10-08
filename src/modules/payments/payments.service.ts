import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShippingService } from '../admin/shipping/shipping.service';
import { RazorpayService } from './razorpay.service';
import {
  CreatePaymentOrderDto,
  PaymentMethodType,
} from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RetryPaymentDto } from './dto/retry-payment.dto';
import { ConfirmCodDto } from './dto/confirm-cod.dto';
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
  OrderStatusEnum,
} from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /**
   * In-flight refund attempts keyed by orderId, so concurrent callers in this
   * process coalesce onto one gateway refund instead of issuing two.
   */
  private readonly activeRefundLocks = new Map<
    string,
    Promise<{
      success: boolean;
      refundInitiated: boolean;
      message: string;
      providerRefundId?: string | null;
      amount?: number;
    }>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly shippingService?: ShippingService,
  ) {}

  /**
   * Public gateway key, so the checkout flow can hand Razorpay options to the
   * client without depending on RazorpayService directly.
   */
  getGatewayKeyId(): string {
    return this.razorpayService.getKeyId();
  }

  /**
   * Promotes an order once its payment is confirmed, exactly once.
   *
   * Issue 2: for online payments the order is created hidden (orderStatus
   * PENDING) with no stock taken and no shipment. The confirmation — whichever
   * of the success callback (verifyPayment) or the Razorpay webhook wins the
   * race — is the single point that:
   *   1. flips the order to PLACED + paymentStatus COMPLETED,
   *   2. decrements stock,
   *   3. clears the cart and fulfills the stock reservation,
   *   4. creates the Shiprocket shipment.
   *
   * The promotion is claimed with a conditional updateMany, so only one caller
   * ever performs 2-4; the loser is a no-op. Shipment creation is additionally
   * guarded on shiprocketShipmentId / trackingNumber so a replay can never
   * create a second shipment.
   *
   * A CANCELLED order (e.g. cancelled by the pending-order cleanup cron before
   * a late capture landed) is never resurrected: the payment is recorded and
   * refunded automatically (refundLateCaptureOnCancelledOrder).
   */
  private async promoteOrderAfterPayment(orderId: string): Promise<{
    promoted: boolean;
    shipped: boolean;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { promoted: false, shipped: false };
    }

    let claimedFromPending = false;
    let claimedVisible = false;

    await this.prisma.$transaction(async (tx) => {
      // 1. Claim the hidden -> visible promotion.
      const pendingClaim = await tx.order.updateMany({
        where: {
          id: orderId,
          orderStatus: OrderStatusEnum.PENDING,
          paymentStatus: { not: PaymentStatusEnum.COMPLETED },
        },
        data: {
          orderStatus: OrderStatusEnum.PLACED,
          paymentStatus: PaymentStatusEnum.COMPLETED,
        },
      });

      claimedFromPending = pendingClaim.count > 0;

      if (!claimedFromPending) {
        // Already-visible order (COD, or an order placed by the legacy flow):
        // stock and cart were handled at placement, only mark it paid.
        const visibleClaim = await tx.order.updateMany({
          where: {
            id: orderId,
            orderStatus: {
              in: [
                OrderStatusEnum.PLACED,
                OrderStatusEnum.PROCESSING,
                OrderStatusEnum.PACKED,
              ],
            },
            paymentStatus: { not: PaymentStatusEnum.COMPLETED },
          },
          data: { paymentStatus: PaymentStatusEnum.COMPLETED },
        });
        claimedVisible = visibleClaim.count > 0;
        return;
      }

      // 2. Stock was deliberately not taken at placement time: take it now.
      for (const item of order.items) {
        if (item.variantId) {
          const updated = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });

          if (updated.count === 0) {
            // The customer has already paid, so the order must stand. Take the
            // stock anyway and surface it loudly for manual reconciliation.
            await tx.productVariant.updateMany({
              where: { id: item.variantId },
              data: { stock: { decrement: item.quantity } },
            });
            this.logger.error(
              `Oversell on paid order ${order.orderNumber}: variant ${item.variantId} had insufficient stock for ${item.quantity} x ${item.productName}. Stock forced down; manual reconciliation required.`,
            );
          }
        } else {
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });

          if (updated.count === 0) {
            await tx.product.updateMany({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
            this.logger.error(
              `Oversell on paid order ${order.orderNumber}: product ${item.productId} had insufficient stock for ${item.quantity} x ${item.productName}. Stock forced down; manual reconciliation required.`,
            );
          }
        }
      }

      // 3. The cart is kept until payment succeeds so a cancelled attempt
      // leaves the customer's cart intact. Clear it now.
      await tx.cartItem.deleteMany({ where: { userId: order.userId } });

      await tx.stockReservation.updateMany({
        where: { userId: order.userId, isFulfilled: false },
        data: { isFulfilled: true },
      });
    });

    if (!claimedFromPending && !claimedVisible) {
      await this.refundLateCaptureOnCancelledOrder(orderId, order.orderNumber);
      return { promoted: false, shipped: false };
    }

    if (claimedFromPending) {
      this.notificationsService.notifyOrderPlaced({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
      });
    }

    const shipped = await this.createShipmentOnce(orderId);

    return { promoted: claimedFromPending, shipped };
  }

  /**
   * A capture that lands after the order was cancelled (typically by the
   * pending-order cleanup cron once the payment window expired). The order is
   * never resurrected; the captured money is refunded automatically through
   * the existing initiateRefundForOrder() path.
   *
   * Claimed with a conditional updateMany (CANCELLED + not yet COMPLETED /
   * refunded), so a concurrent success-callback + webhook pair can only ever
   * trigger one refund. initiateRefundForOrder never throws; a gateway failure
   * is recorded in RefundAudit (FAILED) for manual follow-up.
   */
  private async refundLateCaptureOnCancelledOrder(
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    const claim = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        orderStatus: OrderStatusEnum.CANCELLED,
        paymentStatus: {
          notIn: [
            PaymentStatusEnum.COMPLETED,
            PaymentStatusEnum.REFUND_INITIATED,
            PaymentStatusEnum.REFUNDED,
          ],
        },
      },
      data: { paymentStatus: PaymentStatusEnum.COMPLETED },
    });

    if (claim.count === 0) {
      return;
    }

    this.logger.warn(
      `Payment captured for already-cancelled order ${orderNumber}. Order stays CANCELLED; initiating automatic refund.`,
    );

    const refund = await this.initiateRefundForOrder({
      orderId,
      reason: 'Payment captured after the order was cancelled (payment window expired)',
      actorType: 'SYSTEM',
    });

    if (refund.refundInitiated) {
      this.logger.log(
        `Automatic refund initiated for late capture on cancelled order ${orderNumber}: ${refund.message}`,
      );
    } else {
      this.logger.error(
        `Automatic refund for late capture on cancelled order ${orderNumber} was NOT initiated: ${refund.message}. Manual refund required.`,
      );
    }
  }

  /**
   * Idempotent shipment creation. Re-reads the order so a concurrent
   * success-callback + webhook pair cannot both pass the guard, and defers to
   * ShippingService's own AWB idempotency as a second line of defence.
   */
  private async createShipmentOnce(orderId: string): Promise<boolean> {
    if (!this.shippingService) {
      return false;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        orderStatus: true,
        shiprocketShipmentId: true,
        trackingNumber: true,
      },
    });

    if (!order || order.orderStatus === OrderStatusEnum.CANCELLED) {
      return false;
    }

    if (order.shiprocketShipmentId || order.trackingNumber) {
      this.logger.log(
        `Shipment already exists for order ${order.orderNumber}. Skipping creation.`,
      );
      return false;
    }

    try {
      await this.shippingService.createShipmentForOrder(orderId);
      return true;
    } catch (shippingErr: any) {
      this.logger.error(
        `Automatic shipping workflow error for order ${order.orderNumber}: ${shippingErr?.message || shippingErr}`,
      );
      return false;
    }
  }

  private validateIdempotencyKey(key?: string): string {
    if (!key || typeof key !== 'string' || !UUID_V4_REGEX.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be a valid UUID v4',
      );
    }
    return key;
  }

  private validateUuid(id: string, paramName: string = 'id'): string {
    if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(`${paramName} must be a valid UUID v4`);
    }
    return id;
  }

  private toPaymentMethodEnum(method: string): PaymentMethodEnum {
    const upper = method.toUpperCase();
    if (Object.values(PaymentMethodEnum).includes(upper as PaymentMethodEnum)) {
      return upper as PaymentMethodEnum;
    }
    return PaymentMethodEnum.UPI;
  }

  /**
   * POST /payments/create-order
   */
  async createPaymentOrder(
    userId: string,
    idempotencyKey: string,
    dto: CreatePaymentOrderDto,
  ) {
    const validKey = this.validateIdempotencyKey(idempotencyKey);
    this.validateUuid(dto.orderId, 'orderId');

    // Persistent database idempotency check
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: validKey },
    });

    if (existingPayment) {
      if (existingPayment.userId !== userId) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        success: true,
        message: 'Payment order already created (idempotent response)',
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        razorpayOrderId: existingPayment.razorpayOrderId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        status: existingPayment.status,
        paymentMethod: existingPayment.paymentMethod.toLowerCase(),
        key: this.razorpayService.getKeyId(),
      };
    }

    // Fetch order
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === PaymentStatusEnum.COMPLETED) {
      throw new ConflictException('Order is already paid');
    }

    if (
      order.orderStatus === OrderStatusEnum.CANCELLED ||
      order.orderStatus === OrderStatusEnum.DELIVERED
    ) {
      throw new ConflictException('Order not in payable state');
    }

    // Check if an active PENDING payment already exists for this order
    const pendingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatusEnum.PENDING,
      },
    });

    if (pendingPayment && dto.paymentMethod !== PaymentMethodType.COD) {
      throw new ConflictException('Payment already initiated');
    }

    const methodEnum = this.toPaymentMethodEnum(dto.paymentMethod);

    // COD handling
    if (dto.paymentMethod === PaymentMethodType.COD) {
      try {
        const payment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            userId,
            amount: order.grandTotal,
            currency: 'INR',
            paymentMethod: PaymentMethodEnum.COD,
            status: PaymentStatusEnum.PENDING,
            idempotencyKey: validKey,
          },
        });

        return {
          success: true,
          paymentId: payment.id,
          orderId: order.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentMethod: 'cod',
        };
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const concurrent = await this.prisma.payment.findUnique({
            where: { idempotencyKey: validKey },
          });
          if (concurrent && concurrent.userId === userId) {
            return {
              success: true,
              paymentId: concurrent.id,
              orderId: concurrent.orderId,
              amount: concurrent.amount,
              currency: concurrent.currency,
              status: concurrent.status,
              paymentMethod: 'cod',
            };
          }
        }
        throw error;
      }
    }

    // Online Razorpay Payment creation
    const amountInPaise = Math.round(order.grandTotal * 100);
    const rzpOrder = await this.razorpayService.createRazorpayOrder({
      amountInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        userId,
      },
    });

    try {
      const payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          userId,
          amount: order.grandTotal,
          currency: 'INR',
          paymentMethod: methodEnum,
          status: PaymentStatusEnum.PENDING,
          razorpayOrderId: rzpOrder.id,
          idempotencyKey: validKey,
          upiId: dto.upiId,
          savedCardId: dto.savedCardId,
          walletProvider: dto.walletProvider,
          bankCode: dto.bankCode,
          saveCard: dto.saveCard ?? false,
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        orderId: order.id,
        razorpayOrderId: rzpOrder.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: dto.paymentMethod,
        key: this.razorpayService.getKeyId(),
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const concurrent = await this.prisma.payment.findUnique({
          where: { idempotencyKey: validKey },
        });
        if (concurrent && concurrent.userId === userId) {
          return {
            success: true,
            paymentId: concurrent.id,
            orderId: concurrent.orderId,
            razorpayOrderId: concurrent.razorpayOrderId,
            amount: concurrent.amount,
            currency: concurrent.currency,
            status: concurrent.status,
            paymentMethod: dto.paymentMethod,
            key: this.razorpayService.getKeyId(),
          };
        }
      }
      throw error;
    }
  }

  /**
   * POST /payments/verify
   */
  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    this.validateUuid(dto.orderId, 'orderId');

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Payment not found');
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        razorpayOrderId: dto.razorpayOrderId,
        userId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatusEnum.COMPLETED) {
      throw new ConflictException('Payment already verified');
    }

    const isValidSignature = this.razorpayService.verifySignature({
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      signature: dto.signature,
    });

    if (!isValidSignature) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatusEnum.FAILED,
          failureReason: 'Signature verification failed',
        },
      });
      throw new ConflictException('Signature verification failed');
    }

    // Mark the payment COMPLETED, then promote the order. Stock, cart clearing
    // and the Shiprocket shipment all happen inside promoteOrderAfterPayment()
    // so they occur exactly once across this callback and the webhook.
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatusEnum.COMPLETED,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.signature,
      },
    });

    await this.promoteOrderAfterPayment(dto.orderId);

    return {
      success: true,
      message: 'Payment verified successfully',
      paymentId: updatedPayment.id,
      orderId: dto.orderId,
      status: updatedPayment.status,
    };
  }

  /**
   * POST /payments/retry
   */
  async retryPayment(
    userId: string,
    idempotencyKey: string,
    dto: RetryPaymentDto,
  ) {
    const validKey = this.validateIdempotencyKey(idempotencyKey);
    this.validateUuid(dto.orderId, 'orderId');

    // Check Idempotency
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: validKey },
    });

    if (existingPayment) {
      if (existingPayment.userId !== userId) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        success: true,
        message:
          'Payment retry request already processed (idempotent response)',
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        razorpayOrderId: existingPayment.razorpayOrderId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        status: existingPayment.status,
        paymentMethod: existingPayment.paymentMethod.toLowerCase(),
        key: this.razorpayService.getKeyId(),
      };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === PaymentStatusEnum.COMPLETED) {
      throw new ConflictException('Order not in retryable state');
    }

    if (
      order.orderStatus === 'CANCELLED' ||
      order.orderStatus === 'DELIVERED'
    ) {
      throw new ConflictException('Order not in retryable state');
    }

    // Check retry window (30 minutes expiry)
    const MAX_RETRY_WINDOW_MS = 30 * 60 * 1000;
    const isExpired =
      Date.now() - new Date(order.createdAt).getTime() > MAX_RETRY_WINDOW_MS;

    if (isExpired) {
      throw new ConflictException('Retry window expired');
    }

    // Count previous payment attempts for this order
    const attemptCount = await this.prisma.payment.count({
      where: { orderId: dto.orderId },
    });

    const methodEnum = this.toPaymentMethodEnum(dto.paymentMethod);

    if (dto.paymentMethod === PaymentMethodType.COD) {
      try {
        const payment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            userId,
            amount: order.grandTotal,
            currency: 'INR',
            paymentMethod: PaymentMethodEnum.COD,
            status: PaymentStatusEnum.PENDING,
            idempotencyKey: validKey,
            attempts: attemptCount + 1,
          },
        });

        return {
          success: true,
          paymentId: payment.id,
          orderId: order.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentMethod: 'cod',
        };
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const concurrent = await this.prisma.payment.findUnique({
            where: { idempotencyKey: validKey },
          });
          if (concurrent && concurrent.userId === userId) {
            return {
              success: true,
              paymentId: concurrent.id,
              orderId: concurrent.orderId,
              amount: concurrent.amount,
              currency: concurrent.currency,
              status: concurrent.status,
              paymentMethod: 'cod',
            };
          }
        }
        throw error;
      }
    }

    // Online Razorpay Payment creation for retry
    const amountInPaise = Math.round(order.grandTotal * 100);
    const rzpOrder = await this.razorpayService.createRazorpayOrder({
      amountInPaise,
      currency: 'INR',
      receipt: `${order.orderNumber}-R${attemptCount + 1}`,
      notes: {
        orderId: order.id,
        userId,
        attempt: String(attemptCount + 1),
      },
    });

    try {
      const payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          userId,
          amount: order.grandTotal,
          currency: 'INR',
          paymentMethod: methodEnum,
          status: PaymentStatusEnum.PENDING,
          razorpayOrderId: rzpOrder.id,
          idempotencyKey: validKey,
          upiId: dto.upiId,
          savedCardId: dto.savedCardId,
          walletProvider: dto.walletProvider,
          bankCode: dto.bankCode,
          saveCard: dto.saveCard ?? false,
          attempts: attemptCount + 1,
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        orderId: order.id,
        razorpayOrderId: rzpOrder.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: dto.paymentMethod,
        key: this.razorpayService.getKeyId(),
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const concurrent = await this.prisma.payment.findUnique({
          where: { idempotencyKey: validKey },
        });
        if (concurrent && concurrent.userId === userId) {
          return {
            success: true,
            paymentId: concurrent.id,
            orderId: concurrent.orderId,
            razorpayOrderId: concurrent.razorpayOrderId,
            amount: concurrent.amount,
            currency: concurrent.currency,
            status: concurrent.status,
            paymentMethod: dto.paymentMethod,
            key: this.razorpayService.getKeyId(),
          };
        }
      }
      throw error;
    }
  }

  /**
   * GET /payments/:id
   */
  async getPaymentById(userId: string, id: string) {
    this.validateUuid(id, 'id');

    const payment = await this.prisma.payment.findFirst({
      where: { id, userId },
      include: {
        order: {
          select: {
            orderNumber: true,
            grandTotal: true,
            orderStatus: true,
            paymentStatus: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return {
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod.toLowerCase(),
        status: payment.status,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        attempts: payment.attempts,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        order: payment.order,
      },
    };
  }

  /**
   * POST /payments/cod/confirm
   */
  async confirmCod(userId: string, idempotencyKey: string, dto: ConfirmCodDto) {
    const validKey = this.validateIdempotencyKey(idempotencyKey);
    this.validateUuid(dto.orderId, 'orderId');

    // Idempotency check
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: validKey },
    });

    if (existingPayment) {
      if (existingPayment.userId !== userId) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        success: true,
        message: 'COD payment confirmed successfully (idempotent response)',
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        status: existingPayment.status,
      };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentMethod !== PaymentMethodEnum.COD) {
      throw new ConflictException('COD not selected for this order');
    }

    if (order.paymentStatus === PaymentStatusEnum.COMPLETED) {
      throw new ConflictException('Order already paid');
    }

    if (order.orderStatus === 'CANCELLED') {
      throw new ConflictException('Order is cancelled');
    }

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        // Atomically ensure order is still pending and eligible
        const updateResult = await tx.order.updateMany({
          where: {
            id: order.id,
            userId,
            paymentMethod: PaymentMethodEnum.COD,
            paymentStatus: { not: PaymentStatusEnum.COMPLETED },
            orderStatus: { not: 'CANCELLED' },
          },
          data: {
            paymentStatus: PaymentStatusEnum.COMPLETED,
            orderStatus: 'PLACED',
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Order already confirmed, paid, or cancelled',
          );
        }

        const createdPayment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId,
            amount: order.grandTotal,
            currency: 'INR',
            paymentMethod: PaymentMethodEnum.COD,
            status: PaymentStatusEnum.COMPLETED,
            idempotencyKey: validKey,
          },
        });

        return createdPayment;
      });

      return {
        success: true,
        message: 'COD payment confirmed successfully',
        paymentId: payment.id,
        orderId: order.id,
        status: payment.status,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const concurrent = await this.prisma.payment.findUnique({
          where: { idempotencyKey: validKey },
        });
        if (concurrent && concurrent.userId === userId) {
          return {
            success: true,
            message: 'COD payment confirmed successfully (idempotent response)',
            paymentId: concurrent.id,
            orderId: concurrent.orderId,
            status: concurrent.status,
          };
        }
      }
      throw error;
    }
  }

  /**
   * Initiates a refund for an order whose payment was already captured.
   *
   * Used by the customer-facing cancel flow (and reusable by admin flows). It:
   *  1. Finds the captured payment for the order.
   *  2. Calls the Razorpay refund API with the stored razorpayPaymentId.
   *  3. Records a RefundAudit row in REFUND_INITIATED (or FAILED) state.
   *  4. Moves the order + payment to REFUND_INITIATED.
   *
   * The `refund.processed` webhook later promotes everything to REFUNDED.
   *
   * This method NEVER throws: the caller (order cancellation) must still
   * succeed even if the gateway refund call fails, so failures are reported
   * through the returned result and recorded for retry.
   */
  async initiateRefundForOrder(params: {
    orderId: string;
    amount?: number;
    reason?: string;
    actorType?: string;
    /**
     * Admin who triggered the refund, when one did. Recorded on the
     * RefundAudit so the refund.processed webhook keeps the ADMIN
     * attribution when it promotes the audit to REFUNDED.
     */
    adminId?: string;
  }): Promise<{
    success: boolean;
    refundInitiated: boolean;
    message: string;
    providerRefundId?: string | null;
    amount?: number;
  }> {
    // Serialize refunds per order within this process.
    //
    // The DB guards below read committed state, so two callers that arrive at
    // the same instant can both pass them and both reach the gateway. Rather
    // than racing a second refund, a caller that finds one in flight awaits it
    // and reports that same outcome — so the money moves once and no caller is
    // told the refund failed.
    //
    // Cross-instance safety still comes from the callers' atomic DB claims
    // (admin cancel claims the order, customer cancel claims the status, a
    // late capture claims paymentStatus), which let only one of them call this
    // method at all. Mirrors ShippingService.activeShipmentLocks.
    const inFlight = this.activeRefundLocks.get(params.orderId);
    if (inFlight) {
      this.logger.warn(
        `Refund already in progress for order ${params.orderId}; awaiting the in-flight attempt instead of calling the gateway again.`,
      );
      return inFlight;
    }

    const attempt = this.performRefundForOrder(params);
    this.activeRefundLocks.set(params.orderId, attempt);

    try {
      return await attempt;
    } finally {
      this.activeRefundLocks.delete(params.orderId);
    }
  }

  private async performRefundForOrder(params: {
    orderId: string;
    amount?: number;
    reason?: string;
    actorType?: string;
    /**
     * Admin who triggered the refund, when one did. Recorded on the
     * RefundAudit so the refund.processed webhook keeps the ADMIN
     * attribution when it promotes the audit to REFUNDED.
     */
    adminId?: string;
  }): Promise<{
    success: boolean;
    refundInitiated: boolean;
    message: string;
    providerRefundId?: string | null;
    amount?: number;
  }> {
    const { orderId, reason, actorType = 'CUSTOMER', adminId } = params;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        grandTotal: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      return {
        success: false,
        refundInitiated: false,
        message: 'Order not found for refund initiation',
      };
    }

    // Only captured payments are refundable.
    if (order.paymentStatus !== PaymentStatusEnum.COMPLETED) {
      return {
        success: true,
        refundInitiated: false,
        message: `No refund required (paymentStatus=${order.paymentStatus})`,
      };
    }

    // Double-refund guard: block only on a refund that is still live.
    //
    // A FAILED row is deliberately NOT a blocker. The `refund.failed` webhook
    // stamps providerRefundId onto a FAILED audit and reverts paymentStatus to
    // COMPLETED precisely so the refund can be retried, so matching on
    // providerRefundId alone would make that retry path unreachable.
    const existingLiveRefund = await this.prisma.refundAudit.findFirst({
      where: {
        orderId: order.id,
        status: { notIn: ['FAILED'] },
        OR: [
          { status: { in: ['REFUND_INITIATED', 'REFUNDED', 'COD_REFUNDED'] } },
          // Catches a gateway-accepted refund whose local write did not land
          // (see the recovery insert in the hard-gate path below).
          { providerRefundId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingLiveRefund) {
      this.logger.warn(
        `Refund already recorded for order ${order.orderNumber} (auditId=${existingLiveRefund.id}, status=${existingLiveRefund.status}, providerRefundId=${existingLiveRefund.providerRefundId}). Skipping gateway call.`,
      );
      return {
        success: true,
        refundInitiated: false,
        message: `A refund is already recorded for this order (status=${existingLiveRefund.status})`,
        providerRefundId: existingLiveRefund.providerRefundId || null,
        amount: existingLiveRefund.amount,
      };
    }

    const refundAmount = params.amount ?? order.grandTotal;

    if (refundAmount <= 0 || refundAmount > order.grandTotal) {
      return {
        success: false,
        refundInitiated: false,
        message: `Invalid refund amount ${refundAmount} for order total ${order.grandTotal}`,
      };
    }

    // Locate the captured payment carrying the gateway transaction id.
    const capturedPayment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatusEnum.COMPLETED },
      orderBy: { createdAt: 'desc' },
    });

    // COD orders have no gateway capture to reverse — handled manually by admin.
    if (order.paymentMethod === PaymentMethodEnum.COD) {
      await this.prisma.refundAudit.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          paymentId: capturedPayment?.id || null,
          amount: refundAmount,
          currency: 'INR',
          refundMethod: 'COD',
          status: 'REFUND_INITIATED',
          provider: 'MANUAL',
          actorType,
          initiatedByAdminId: adminId || null,
          initiatedAt: new Date(),
          failureReason: reason ? `Cancellation: ${reason}` : null,
          idempotencyKey: `cancel_refund_${order.id}_cod_${Date.now()}`,
        },
      });

      return {
        success: true,
        refundInitiated: true,
        message:
          'COD refund recorded for manual processing (no gateway capture to reverse)',
        amount: refundAmount,
      };
    }

    if (!capturedPayment?.razorpayPaymentId) {
      // Payment marked COMPLETED but no gateway id -> cannot auto-refund.
      await this.prisma.refundAudit.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          paymentId: capturedPayment?.id || null,
          amount: refundAmount,
          currency: 'INR',
          refundMethod: 'ORIGINAL_PAYMENT',
          status: 'FAILED',
          provider: 'RAZORPAY',
          actorType,
          initiatedByAdminId: adminId || null,
          initiatedAt: new Date(),
          failedAt: new Date(),
          failureReason:
            'No razorpayPaymentId on the captured payment; manual refund required',
          idempotencyKey: `cancel_refund_${order.id}_failed_${Date.now()}`,
        },
      });

      this.logger.error(
        `Cannot auto-refund order ${order.orderNumber}: captured payment has no razorpayPaymentId.`,
      );

      return {
        success: false,
        refundInitiated: false,
        message:
          'Captured payment has no gateway reference; refund flagged for manual processing',
      };
    }

    // Call the gateway refund API.
    //
    // `receipt` is a merchant-side reference for reconciliation only: Razorpay
    // does NOT deduplicate refunds on it. True gateway idempotency needs the
    // X-Razorpay-Idempotency header, which the razorpay SDK (v2.9.8) cannot
    // send — `payments.refund()` accepts only (paymentId, params[, callback]).
    // Protection against a duplicate refund is therefore DB-state based: the
    // paymentStatus check and the live-refund guard above, plus the callers'
    // atomic claims.
    const gatewayReceipt = `cancel_${order.orderNumber}`.slice(0, 40);
    let refund: { id: string; amount: number; status: string };
    try {
      refund = await this.razorpayService.createRefund({
        paymentId: capturedPayment.razorpayPaymentId,
        amountInPaise: Math.round(refundAmount * 100),
        notes: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: reason || 'Order cancelled by customer',
        },
        receipt: gatewayReceipt,
      });
    } catch (error: any) {
      const failureReason =
        error?.error?.description || error?.message || 'Razorpay refund failed';

      // Record the failure so it can be retried; leave paymentStatus COMPLETED.
      try {
        await this.prisma.refundAudit.create({
          data: {
            orderId: order.id,
            userId: order.userId,
            paymentId: capturedPayment.id,
            amount: refundAmount,
            currency: 'INR',
            refundMethod: 'ORIGINAL_PAYMENT',
            status: 'FAILED',
            provider: 'RAZORPAY',
            actorType,
            initiatedByAdminId: adminId || null,
            initiatedAt: new Date(),
            failedAt: new Date(),
            failureReason,
            failureCode: error?.error?.code || null,
            idempotencyKey: `cancel_refund_${order.id}_failed_${Date.now()}`,
          },
        });
      } catch {
        // Audit write failure must not mask the original gateway error.
      }

      this.logger.error(
        `Refund initiation FAILED for order ${order.orderNumber}: ${failureReason}`,
      );

      this.notificationsService.notifyRefundStatus({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        status: 'ONLINE_REFUND_FAILED',
        refundAmount,
      });

      return {
        success: false,
        refundInitiated: false,
        message: `Refund initiation failed: ${failureReason}`,
      };
    }

    // HARD GATE: Razorpay refund succeeded! The customer has been refunded at the gateway.
    // Local DB/audit persistence failure must NEVER report failure to the caller,
    // which could prompt a duplicate manual refund.
    let dbPersisted = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.refundAudit.create({
          data: {
            orderId: order.id,
            userId: order.userId,
            paymentId: capturedPayment.id,
            amount: refundAmount,
            currency: 'INR',
            refundMethod: 'ORIGINAL_PAYMENT',
            status: 'REFUND_INITIATED',
            provider: 'RAZORPAY',
            providerRefundId: refund.id,
            actorType,
            initiatedByAdminId: adminId || null,
            initiatedAt: new Date(),
            failureReason: reason ? `Cancellation: ${reason}` : null,
            idempotencyKey: `cancel_refund_${order.id}_${refund.id}`,
          },
        });

        await tx.payment.update({
          where: { id: capturedPayment.id },
          data: { status: PaymentStatusEnum.REFUND_INITIATED },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatusEnum.REFUND_INITIATED },
        });
      });
      dbPersisted = true;
    } catch (dbErr: any) {
      this.logger.error(
        `Razorpay refund succeeded (refundId=${refund.id}), but local DB update threw error for order ${order.orderNumber}: ${dbErr?.message || dbErr}. Webhook will reconcile the order.`,
      );

      // The transaction rolled back, so nothing records that the gateway has
      // already refunded this order — a later attempt would pass both guards
      // and refund a second time. Insert the audit row on its own, outside any
      // transaction, so the live-refund guard can see it.
      //
      // Status is REFUND_INITIATED so the `refund.processed` webhook finds it
      // as its pending audit and promotes this same row to REFUNDED instead of
      // creating a duplicate. Best-effort: if this write also fails the refund
      // still succeeded, and the webhook reconciles from the payment record.
      try {
        await this.prisma.refundAudit.create({
          data: {
            orderId: order.id,
            userId: order.userId,
            paymentId: capturedPayment.id,
            amount: refundAmount,
            currency: 'INR',
            refundMethod: 'ORIGINAL_PAYMENT',
            status: 'REFUND_INITIATED',
            provider: 'RAZORPAY',
            providerRefundId: refund.id,
            actorType,
            initiatedByAdminId: adminId || null,
            initiatedAt: new Date(),
            failureReason: `Gateway refund succeeded; local persistence failed and was recorded out of band: ${dbErr?.message || dbErr}`,
            idempotencyKey: `cancel_refund_${order.id}_${refund.id}`,
          },
        });
        this.logger.warn(
          `Recorded out-of-band refund audit for order ${order.orderNumber} (refundId=${refund.id}) to prevent a duplicate refund.`,
        );
      } catch (auditErr: any) {
        this.logger.error(
          `CRITICAL: Razorpay refund ${refund.id} for order ${order.orderNumber} could not be recorded locally (${auditErr?.message || auditErr}). A manual refund MUST NOT be issued for this order without checking Razorpay first.`,
        );
      }
    }

    this.logger.log(
      `Refund initiated for order ${order.orderNumber}: refundId=${refund.id}, amount=₹${refundAmount} (dbPersisted=${dbPersisted}).`,
    );

    this.notificationsService.notifyRefundStatus({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: 'ONLINE_REFUND_INITIATED',
      refundAmount,
    });

    return {
      success: true,
      refundInitiated: true,
      message: dbPersisted
        ? 'Refund initiated successfully'
        : 'Refund initiated with provider; local persistence pending reconciliation',
      providerRefundId: refund.id,
      amount: refundAmount,
    };
  }

  /**
   * POST /payments/webhook
   */
  async handleWebhook(
    signature: string,
    body: any,
    rawBody?: string | Buffer,
    headerEventId?: string,
  ) {
    const isValid = this.razorpayService.verifyWebhookSignature({
      rawBody: rawBody || JSON.stringify(body || {}),
      signature: signature || '',
    });

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventType = body?.event || 'unknown';
    const paymentEntity = body?.payload?.payment?.entity;
    const orderEntity = body?.payload?.order?.entity;
    const refundEntity = body?.payload?.refund?.entity;

    const eventId =
      headerEventId ||
      body?.id ||
      body?.event_id ||
      (paymentEntity?.id
        ? `${eventType}_${paymentEntity.id}`
        : orderEntity?.id
          ? `${eventType}_${orderEntity.id}`
          : `evt_${Date.now()}`);

    // Duplicate check for webhook idempotency
    const existingLog = await this.prisma.webhookLog.findUnique({
      where: { eventId },
    });

    if (existingLog) {
      return {
        success: true,
        message: 'Webhook event already processed',
      };
    }

    // Save WebhookLog entry with graceful P2002 handling on concurrent duplicate delivery
    try {
      await this.prisma.webhookLog.create({
        data: {
          eventId,
          event: eventType,
          payload: JSON.parse(JSON.stringify(body || {})),
          status: 'SUCCESS',
          processedAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return {
          success: true,
          message: 'Webhook event already processed',
        };
      }
      throw error;
    }

    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id || refundEntity?.payment_id;

    if (razorpayOrderId || razorpayPaymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          OR: [
            ...(razorpayOrderId ? [{ razorpayOrderId }] : []),
            ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
          ],
        },
        // orderStatus is selected so refund handling can tell a CANCELLED
        // order apart from a RETURNED one without an extra query.
        include: {
          order: { select: { orderNumber: true, orderStatus: true } },
        },
      });

      if (payment) {
        if (
          eventType === 'payment.captured' ||
          eventType === 'payment.authorized' ||
          eventType === 'order.paid'
        ) {
          if (payment.status !== PaymentStatusEnum.COMPLETED) {
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatusEnum.COMPLETED,
                razorpayPaymentId:
                  paymentEntity?.id || payment.razorpayPaymentId,
                razorpaySignature: signature || payment.razorpaySignature,
              },
            });

            // Single, idempotent promotion path shared with verifyPayment:
            // PLACED + stock + cart clear + Shiprocket shipment, exactly once.
            await this.promoteOrderAfterPayment(payment.orderId);

            this.notificationsService.notifyPaymentSuccess({
              orderId: payment.orderId,
              orderNumber:
                (payment as any).order?.orderNumber || payment.orderId,
              userId: payment.userId,
              grandTotal: payment.amount,
            });
          }
        } else if (eventType === 'payment.failed') {
          if (payment.status !== PaymentStatusEnum.COMPLETED) {
            await this.prisma.$transaction(async (tx) => {
              await tx.payment.update({
                where: { id: payment.id },
                data: {
                  status: PaymentStatusEnum.FAILED,
                  failureReason:
                    paymentEntity?.error_description ||
                    paymentEntity?.error_reason ||
                    'Payment failed',
                },
              });

              // Only the payment state changes. A hidden (PENDING) order must
              // stay hidden with no stock taken and no shipment — the
              // pending-order cleanup cron cancels it after the retry window.
              await tx.order.updateMany({
                where: {
                  id: payment.orderId,
                  paymentStatus: { not: PaymentStatusEnum.COMPLETED },
                },
                data: {
                  paymentStatus: PaymentStatusEnum.FAILED,
                },
              });

              // Immediate stock reservation release on payment failure
              await tx.stockReservation.updateMany({
                where: {
                  userId: payment.userId,
                  isFulfilled: false,
                },
                data: {
                  expiresAt: new Date(Date.now() - 1000),
                },
              });
            });

            this.notificationsService.notifyPaymentFailed({
              orderId: payment.orderId,
              orderNumber:
                (payment as any).order?.orderNumber || payment.orderId,
              userId: payment.userId,
            });
          }
        } else if (
          eventType === 'refund.processed' ||
          eventType === 'refund.created' ||
          eventType === 'refund.speed_changed'
        ) {
          const refundId = refundEntity?.id;
          const idempotencyKey = refundId
            ? `razorpay_refund_${refundId}_processed`
            : `razorpay_refund_${payment.orderId}_processed`;

          const existingAudit = refundId
            ? await this.prisma.refundAudit.findFirst({
                where: {
                  OR: [
                    { idempotencyKey },
                    { providerRefundId: refundId, status: 'REFUNDED' },
                  ],
                },
              })
            : null;

          if (!existingAudit || existingAudit.status !== 'REFUNDED') {
            const rAmt = refundEntity?.amount
              ? refundEntity.amount / 100
              : payment.amount;

            // A refund can originate from a RETURN or from a CANCELLATION.
            // Only move the order into RETURNED when it was not cancelled — a
            // cancelled order is terminal and must stay CANCELLED so its
            // timeline never shows post-cancellation return/delivery stages.
            const wasCancelled =
              (payment as any).order?.orderStatus === OrderStatusEnum.CANCELLED;

            await this.prisma.$transaction(async (tx) => {
              await tx.order.update({
                where: { id: payment.orderId },
                data: {
                  ...(wasCancelled
                    ? {}
                    : { orderStatus: OrderStatusEnum.RETURNED }),
                  paymentStatus: PaymentStatusEnum.REFUNDED,
                },
              });

              // Keep the payment row in step with the order.
              await tx.payment.update({
                where: { id: payment.id },
                data: { status: PaymentStatusEnum.REFUNDED },
              });

              const pendingAudit = await tx.refundAudit.findFirst({
                where: {
                  orderId: payment.orderId,
                  status: 'REFUND_INITIATED',
                },
                orderBy: { createdAt: 'desc' },
              });

              if (pendingAudit) {
                await tx.refundAudit.update({
                  where: { id: pendingAudit.id },
                  data: {
                    status: 'REFUNDED',
                    providerRefundId: refundId || pendingAudit.providerRefundId,
                    completedAt: new Date(),
                    actorType: pendingAudit.initiatedByAdminId
                      ? 'ADMIN'
                      : 'RAZORPAY_WEBHOOK',
                    idempotencyKey,
                  },
                });
              } else {
                await tx.refundAudit.create({
                  data: {
                    orderId: payment.orderId,
                    userId: payment.userId,
                    paymentId: payment.id,
                    amount: rAmt,
                    currency: 'INR',
                    refundMethod: 'ONLINE',
                    status: 'REFUNDED',
                    provider: 'RAZORPAY',
                    providerRefundId: refundId || null,
                    actorType: 'RAZORPAY_WEBHOOK',
                    initiatedAt: new Date(),
                    completedAt: new Date(),
                    idempotencyKey,
                  },
                });
              }
            });

            if (eventType === 'refund.processed') {
              this.notificationsService.notifyRefundStatus({
                orderId: payment.orderId,
                orderNumber:
                  (payment as any).order?.orderNumber || payment.orderId,
                userId: payment.userId,
                status: 'ONLINE_REFUND_SUCCESS',
                refundAmount: rAmt,
              });
            }
          }
        } else if (eventType === 'refund.failed') {
          const refundId = refundEntity?.id;
          const idempotencyKey = refundId
            ? `razorpay_refund_${refundId}_failed`
            : `razorpay_refund_${payment.orderId}_failed`;

          const existingAudit = refundId
            ? await this.prisma.refundAudit.findFirst({
                where: {
                  OR: [
                    { idempotencyKey },
                    { providerRefundId: refundId, status: 'FAILED' },
                  ],
                },
              })
            : null;

          if (!existingAudit) {
            const failureReason =
              refundEntity?.error_description ||
              refundEntity?.error_reason ||
              'Razorpay refund failed';
            const failureCode = refundEntity?.error_code || null;

            await this.prisma.$transaction(async (tx) => {
              // Revert an in-flight REFUND_INITIATED back to COMPLETED so the
              // refund can be retried. The order itself stays CANCELLED /
              // RETURNED — only the payment state is rolled back.
              await tx.order.updateMany({
                where: {
                  id: payment.orderId,
                  paymentStatus: PaymentStatusEnum.REFUND_INITIATED,
                },
                data: { paymentStatus: PaymentStatusEnum.COMPLETED },
              });
              await tx.payment.updateMany({
                where: {
                  id: payment.id,
                  status: PaymentStatusEnum.REFUND_INITIATED,
                },
                data: { status: PaymentStatusEnum.COMPLETED },
              });

              const pendingAudit = await tx.refundAudit.findFirst({
                where: {
                  orderId: payment.orderId,
                  status: 'REFUND_INITIATED',
                },
                orderBy: { createdAt: 'desc' },
              });

              if (pendingAudit) {
                await tx.refundAudit.update({
                  where: { id: pendingAudit.id },
                  data: {
                    status: 'FAILED',
                    providerRefundId: refundId || pendingAudit.providerRefundId,
                    failedAt: new Date(),
                    failureReason,
                    failureCode,
                    actorType: pendingAudit.initiatedByAdminId
                      ? 'ADMIN'
                      : 'RAZORPAY_WEBHOOK',
                    idempotencyKey,
                  },
                });
              } else {
                await tx.refundAudit.create({
                  data: {
                    orderId: payment.orderId,
                    userId: payment.userId,
                    paymentId: payment.id,
                    amount: refundEntity?.amount
                      ? refundEntity.amount / 100
                      : payment.amount,
                    currency: 'INR',
                    refundMethod: 'ONLINE',
                    status: 'FAILED',
                    provider: 'RAZORPAY',
                    providerRefundId: refundId || null,
                    actorType: 'RAZORPAY_WEBHOOK',
                    initiatedAt: new Date(),
                    failedAt: new Date(),
                    failureReason,
                    failureCode,
                    idempotencyKey,
                  },
                });
              }
            });

            this.logger.warn(
              `Razorpay refund failed for paymentId=${payment.id}, orderId=${payment.orderId}. Reason: ${failureReason}`,
            );
            this.notificationsService.notifyRefundStatus({
              orderId: payment.orderId,
              orderNumber:
                (payment as any).order?.orderNumber || payment.orderId,
              userId: payment.userId,
              status: 'ONLINE_REFUND_FAILED',
            });
          }
        }
      }
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }
}
