import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatusEnum } from '@prisma/client';
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

    // Optimistic: only advance if no webhook moved the order meanwhile.
    const res = await this.prisma.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus },
      data: { orderStatus: target },
    });
    if (res.count === 0) return undefined;

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

    return { processed: orders.length, newEvents };
  }
}
