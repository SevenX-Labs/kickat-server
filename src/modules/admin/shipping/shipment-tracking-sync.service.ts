import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ShippingService } from './shipping.service';
import { ShiprocketWebhookService } from './shiprocket-webhook.service';
import { OrderTrackingEventsService } from './order-tracking-events.service';
import {
  parseShiprocketScan,
  ParsedTrackingEvent,
  stageToForwardOrderStatus,
} from './tracking-events.util';

/** Orders whose parcel is with (or returning via) the courier. */
const IN_TRANSIT_STATUSES: OrderStatusEnum[] = [
  OrderStatusEnum.PACKED,
  OrderStatusEnum.SHIPPED,
  OrderStatusEnum.OUT_FOR_DELIVERY,
  OrderStatusEnum.RETURN_INITIATED,
];

const ACTIVE_RETURN_STATUSES = [
  'INITIATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
];

const RETURN_STATUS_RANK: Record<string, number> = {
  INITIATED: 0,
  PICKUP_SCHEDULED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  RETURN_RECEIVED: 4,
};

const FORWARD_RANK: Partial<Record<OrderStatusEnum, number>> = {
  [OrderStatusEnum.SHIPPED]: 1,
  [OrderStatusEnum.OUT_FOR_DELIVERY]: 2,
  [OrderStatusEnum.DELIVERED]: 3,
};

/**
 * Fallback for missed Shiprocket webhooks: pulls AWB tracking from the
 * provider (GET /courier/track/awb/{awb}) for in-transit orders and stores the
 * scans through the same persistence path the webhook uses.
 *
 * When the pulled scans prove the parcel has moved forward (shipped / out for
 * delivery / delivered) and the order is behind, the order status is advanced
 * using the webhook's own progression rules. Cancellation and RTO transitions
 * are deliberately left to the webhook flow.
 */
@Injectable()
export class ShipmentTrackingSyncService {
  private readonly logger = new Logger(ShipmentTrackingSyncService.name);
  private static readonly BATCH_LIMIT = 25;
  private isRunning = false;
  private cursorOrderId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingService: ShippingService,
    private readonly trackingEventsService: OrderTrackingEventsService,
    private readonly webhookService: ShiprocketWebhookService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Pulls and stores tracking for one order on demand. Returns the number of
   * new events stored. Throws on provider errors so callers can decide.
   */
  async syncOrderTracking(orderId: string): Promise<{
    synced: boolean;
    newEvents: number;
    statusAdvancedTo?: OrderStatusEnum;
    message: string;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        orderStatus: true,
        paymentMethod: true,
        paymentStatus: true,
        trackingNumber: true,
        courierPartner: true,
        estimatedDelivery: true,
        shiprocketShipmentId: true,
      },
    });

    if (!order) {
      return { synced: false, newEvents: 0, message: 'Order not found' };
    }
    if (!order.trackingNumber) {
      return { synced: false, newEvents: 0, message: 'No AWB assigned yet' };
    }

    const provider = this.shippingService.getShippingProvider();
    if (typeof provider.getShipmentTrackingByAwb !== 'function') {
      return {
        synced: false,
        newEvents: 0,
        message: `Provider ${provider.providerName} does not support AWB tracking`,
      };
    }

    const result = await provider.getShipmentTrackingByAwb(
      order.trackingNumber,
    );
    const events = (result.activities || [])
      .map((a) => parseShiprocketScan(a))
      .filter((e): e is ParsedTrackingEvent => !!e);

    const newEvents = await this.trackingEventsService.recordEvents(
      order.id,
      events,
      {
        source: 'POLL',
        awb: order.trackingNumber,
        shipmentId: order.shiprocketShipmentId,
      },
    );

    const statusAdvancedTo = await this.advanceOrderStatusFromEvents(
      order,
      events,
    );

    return {
      synced: true,
      newEvents,
      ...(statusAdvancedTo ? { statusAdvancedTo } : {}),
      message: `Synced ${events.length} provider event(s), ${newEvents} new`,
    };
  }

  private async advanceOrderStatusFromEvents(
    order: {
      id: string;
      orderNumber: string;
      userId: string;
      orderStatus: OrderStatusEnum;
      paymentMethod?: PaymentMethodEnum | null;
      paymentStatus?: PaymentStatusEnum | null;
      trackingNumber: string | null;
      courierPartner: string | null;
      estimatedDelivery: Date | null;
    },
    events: ParsedTrackingEvent[],
  ): Promise<OrderStatusEnum | undefined> {
    // RTO / cancellation have refund and stock side effects owned by the
    // webhook flow; never infer a forward status for such a shipment.
    if (
      events.some((e) =>
        ['CANCELLED', 'RTO_INITIATED', 'RTO_DELIVERED'].includes(e.stage),
      )
    ) {
      return undefined;
    }

    let target: OrderStatusEnum | null = null;
    for (const e of events) {
      const status = stageToForwardOrderStatus(e.stage);
      if (
        status &&
        (!target || (FORWARD_RANK[status] ?? 0) > (FORWARD_RANK[target] ?? 0))
      ) {
        target = status;
      }
    }

    if (
      !target ||
      !this.webhookService.canAdvanceStatus(order.orderStatus, target)
    ) {
      return undefined;
    }

    const updateData: any = { orderStatus: target };
    if (
      target === OrderStatusEnum.DELIVERED &&
      order.paymentMethod === PaymentMethodEnum.COD &&
      order.paymentStatus === PaymentStatusEnum.PENDING
    ) {
      updateData.paymentStatus = PaymentStatusEnum.COMPLETED;
    }

    // Optimistic: only advance if no webhook moved the order meanwhile.
    const res = await this.prisma.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus },
      data: updateData,
    });
    if (res.count === 0) return undefined;

    if (updateData.paymentStatus === PaymentStatusEnum.COMPLETED) {
      await this.prisma.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.COMPLETED },
      });
    }

    this.logger.log(
      `Tracking sync advanced order ${order.orderNumber}: ${order.orderStatus} -> ${target}.`,
    );

    try {
      this.notificationsService.notifyOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        oldStatus: order.orderStatus,
        newStatus: target,
        trackingNumber: order.trackingNumber,
        courierPartner: order.courierPartner,
        estimatedDelivery: order.estimatedDelivery,
      });
    } catch (notifyErr: any) {
      this.logger.warn(
        `Failed to dispatch notification for order ${order.orderNumber}: ${notifyErr?.message || notifyErr}`,
      );
    }

    return target;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleInTransitTrackingSync() {
    if (this.isRunning) return { processed: 0, newEvents: 0 };
    this.isRunning = true;
    try {
      return await this.syncInTransitOrders();
    } catch (error: any) {
      this.logger.error(
        'Error during tracking sync scan',
        error?.stack || error,
      );
      return { processed: 0, newEvents: 0 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Walks in-transit orders in id order, BATCH_LIMIT per run, resuming from
   * the last processed id so every order is eventually revisited.
   */
  async syncInTransitOrders(): Promise<{
    processed: number;
    newEvents: number;
  }> {
    const provider = this.shippingService.getShippingProvider();
    if (typeof provider.getShipmentTrackingByAwb !== 'function') {
      return { processed: 0, newEvents: 0 };
    }

    const orders = await this.prisma.order.findMany({
      where: {
        orderStatus: { in: IN_TRANSIT_STATUSES },
        trackingNumber: { not: null },
        ...(this.cursorOrderId ? { id: { gt: this.cursorOrderId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: ShipmentTrackingSyncService.BATCH_LIMIT,
      select: { id: true, orderNumber: true },
    });

    this.cursorOrderId =
      orders.length === ShipmentTrackingSyncService.BATCH_LIMIT
        ? orders[orders.length - 1].id
        : null;

    let newEvents = 0;
    for (const order of orders) {
      try {
        const res = await this.syncOrderTracking(order.id);
        newEvents += res.newEvents;
      } catch (err: any) {
        this.logger.warn(
          `Tracking sync failed for order ${order.orderNumber}: ${err?.message || err}`,
        );
      }
    }

    // Also poll return shipments with active AWBs
    const returnsSynced = await this.syncReturnShipments(provider);

    return {
      processed: orders.length + returnsSynced.processed,
      newEvents: newEvents + returnsSynced.newEvents,
    };
  }

  /**
   * Polls return shipments with active AWBs and updates their status based
   * on live tracking data from the shipping provider.
   */
  private cursorReturnId: string | null = null;

  private async syncReturnShipments(provider: any): Promise<{
    processed: number;
    newEvents: number;
  }> {
    if (typeof provider.getReturnTracking !== 'function') {
      return { processed: 0, newEvents: 0 };
    }

    const returns = await this.prisma.orderReturn.findMany({
      where: {
        returnAwb: { not: null },
        status: { in: ACTIVE_RETURN_STATUSES },
        ...(this.cursorReturnId
          ? { id: { gt: this.cursorReturnId } }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: ShipmentTrackingSyncService.BATCH_LIMIT,
      select: {
        id: true,
        returnAwb: true,
        status: true,
        orderId: true,
        order: {
          select: { id: true, orderNumber: true, userId: true },
        },
      },
    });

    this.cursorReturnId =
      returns.length === ShipmentTrackingSyncService.BATCH_LIMIT
        ? returns[returns.length - 1].id
        : null;

    let processed = 0;
    let newEvents = 0;

    for (const ret of returns) {
      try {
        const tracking = await provider.getReturnTracking(ret.returnAwb);
        if (!tracking?.checkpoints?.length) continue;

        const newStatus = this.deriveReturnStatus(tracking.currentStatus);
        if (
          newStatus &&
          newStatus !== ret.status &&
          RETURN_STATUS_RANK[newStatus] > (RETURN_STATUS_RANK[ret.status] ?? 0)
        ) {
          const updateData: any = { status: newStatus };
          if (newStatus === 'RETURN_RECEIVED') {
            updateData.refundedAt = new Date();
          }

          await this.prisma.orderReturn.update({
            where: { id: ret.id },
            data: updateData,
          });

          this.logger.log(
            `Return sync advanced return ${ret.id} (order ${ret.order?.orderNumber}): ${ret.status} -> ${newStatus}`,
          );

          if (newStatus === 'RETURN_RECEIVED') {
            try {
              this.notificationsService.notifyReturnStatus({
                orderId: ret.orderId,
                orderNumber: ret.order?.orderNumber || '',
                userId: ret.order?.userId || '',
                status: 'RETURN_RECEIVED',
              });
            } catch {}
          }
        }

        processed++;
        newEvents += tracking.checkpoints.length;
      } catch (err: any) {
        this.logger.warn(
          `Return tracking sync failed for return ${ret.id}: ${err?.message || err}`,
        );
      }
    }

    return { processed, newEvents };
  }

  private deriveReturnStatus(
    providerStatus: string | undefined | null,
  ): string | null {
    if (!providerStatus) return null;
    const normalized = providerStatus.toUpperCase().trim();

    if (normalized.includes('DELIVERED') || normalized === 'DL') {
      return 'RETURN_RECEIVED';
    }
    if (normalized.includes('IN TRANSIT') || normalized.includes('IN_TRANSIT')) {
      return 'IN_TRANSIT';
    }
    if (
      normalized.includes('PICKED UP') ||
      normalized.includes('PICKUP DONE') ||
      normalized.includes('PICKED_UP')
    ) {
      return 'PICKED_UP';
    }
    return null;
  }
}
