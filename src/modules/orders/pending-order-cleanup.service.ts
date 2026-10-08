import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatusEnum, PaymentStatusEnum } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Issue 2 cleanup job.
 *
 * Online (Razorpay) orders are created hidden — orderStatus PENDING,
 * paymentStatus PENDING — and are only promoted to PLACED once the payment is
 * verified. An abandoned or cancelled gateway screen therefore leaves a hidden
 * order behind. This job closes those out after the 30-minute payment retry
 * window so they do not linger as indefinitely-payable records.
 *
 * Stock: a PENDING order never had stock deducted (the deduction happens in
 * PaymentsService.promoteOrderAfterPayment, after payment confirmation), so
 * there is nothing to restore here — restoring would invent stock. The job
 * asserts that and logs loudly if it ever finds a PENDING order that somehow
 * carries a shipment.
 */
@Injectable()
export class PendingOrderCleanupService {
  private readonly logger = new Logger(PendingOrderCleanupService.name);

  /** Must match the payment retry window used by OrdersService/PaymentsService. */
  private static readonly PAYMENT_WINDOW_MS = 30 * 60 * 1000;
  private static readonly BATCH_LIMIT = 100;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAbandonedPendingOrders() {
    try {
      const result = await this.cancelAbandonedPendingOrders();
      if (result.cancelledCount > 0) {
        this.logger.log(
          `Pending-order cleanup cancelled ${result.cancelledCount} abandoned unpaid order(s).`,
        );
      }
      return result;
    } catch (error: any) {
      this.logger.error(
        'Error during pending-order cleanup scan',
        error?.stack || error,
      );
      return { cancelledCount: 0 };
    }
  }

  async cancelAbandonedPendingOrders() {
    const cutoff = new Date(
      Date.now() - PendingOrderCleanupService.PAYMENT_WINDOW_MS,
    );

    const staleOrders = await this.prisma.order.findMany({
      where: {
        orderStatus: OrderStatusEnum.PENDING,
        paymentStatus: {
          in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.FAILED],
        },
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        orderNumber: true,
        shiprocketShipmentId: true,
        trackingNumber: true,
      },
      take: PendingOrderCleanupService.BATCH_LIMIT,
    });

    if (staleOrders.length === 0) {
      return { cancelledCount: 0 };
    }

    let cancelledCount = 0;

    for (const order of staleOrders) {
      if (order.shiprocketShipmentId || order.trackingNumber) {
        // Should be impossible: shipments are created only after payment is
        // verified. Flagged rather than silently cancelled.
        this.logger.error(
          `Unpaid order ${order.orderNumber} carries a shipment (shipmentId=${order.shiprocketShipmentId}, awb=${order.trackingNumber}). Skipping automatic cancellation; manual review required.`,
        );
        continue;
      }

      try {
        // Atomic claim: a payment confirmed in the meantime moves the order
        // out of PENDING and this update matches nothing.
        const cancelled = await this.prisma.order.updateMany({
          where: {
            id: order.id,
            orderStatus: OrderStatusEnum.PENDING,
            paymentStatus: {
              in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.FAILED],
            },
          },
          data: {
            orderStatus: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment timeout',
            cancelReasonCode: 'PAYMENT_TIMEOUT',
            cancelledAt: new Date(),
          },
        });

        if (cancelled.count > 0) {
          cancelledCount++;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to cancel abandoned unpaid order ${order.orderNumber}: ${err?.message || err}`,
        );
      }
    }

    return { cancelledCount };
  }
}
