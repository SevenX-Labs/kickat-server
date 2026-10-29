import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import * as crypto from 'crypto';
import { OrderTrackingEventsService } from './order-tracking-events.service';
import { ParsedTrackingEvent, parseProviderTimestamp } from './tracking-events.util';

export const EKART_STATUS_MAP: Record<string, OrderStatusEnum> = {
  'DELIVERED': OrderStatusEnum.DELIVERED,
  'DELIVERED SUCCESSFULLY': OrderStatusEnum.DELIVERED,

  'OUT FOR DELIVERY': OrderStatusEnum.OUT_FOR_DELIVERY,
  'OUT_FOR_DELIVERY': OrderStatusEnum.OUT_FOR_DELIVERY,

  'IN TRANSIT': OrderStatusEnum.SHIPPED,
  'IN_TRANSIT': OrderStatusEnum.SHIPPED,
  'DISPATCHED': OrderStatusEnum.SHIPPED,
  'PICKED UP': OrderStatusEnum.SHIPPED,
  'PICKUP DONE': OrderStatusEnum.SHIPPED,
  'REACHED AT HUB': OrderStatusEnum.SHIPPED,
  'REACHED AT DESTINATION': OrderStatusEnum.SHIPPED,

  'ORDER PLACED': OrderStatusEnum.PACKED,
  'MANIFESTED': OrderStatusEnum.PACKED,
  'AWB ASSIGNED': OrderStatusEnum.PACKED,
  'READY TO SHIP': OrderStatusEnum.PACKED,

  'CANCELLED': OrderStatusEnum.CANCELLED,
  'CANCELED': OrderStatusEnum.CANCELLED,

  'RTO': OrderStatusEnum.RETURN_INITIATED,
  'RTO INITIATED': OrderStatusEnum.RETURN_INITIATED,
  'RTO IN TRANSIT': OrderStatusEnum.RETURN_INITIATED,
  'RTO OUT FOR DELIVERY': OrderStatusEnum.RETURN_INITIATED,
  'RTO DELIVERED': OrderStatusEnum.RETURNED,
  'RETURNED': OrderStatusEnum.RETURNED,
};

const STATUS_PROGRESSION_RANK: Record<OrderStatusEnum, number> = {
  [OrderStatusEnum.PENDING]: 10,
  [OrderStatusEnum.PLACED]: 20,
  [OrderStatusEnum.PROCESSING]: 30,
  [OrderStatusEnum.PACKED]: 40,
  [OrderStatusEnum.SHIPPED]: 50,
  [OrderStatusEnum.OUT_FOR_DELIVERY]: 60,
  [OrderStatusEnum.DELIVERED]: 70,
  [OrderStatusEnum.RETURN_INITIATED]: 80,
  [OrderStatusEnum.RETURNED]: 90,
  [OrderStatusEnum.CANCELLED]: 100,
};

export interface ProcessEkartWebhookOptions {
  headers: Record<string, any>;
  body: any;
  rawBody?: string | Buffer;
}

export interface ProcessEkartWebhookResult {
  success: boolean;
  message: string;
  duplicate?: boolean;
  orderId?: string;
  orderNumber?: string;
  matched?: boolean;
  test?: boolean;
}

@Injectable()
export class EkartWebhookService {
  private readonly logger = new Logger(EkartWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Optional()
    private readonly trackingEventsService?: OrderTrackingEventsService,
  ) {}

  verifyHmacSignature(
    headers: Record<string, any>,
    rawBody?: string | Buffer,
  ): boolean {
    const secret = (
      this.configService.get<string>('EKART_WEBHOOK_SECRET', '') || ''
    ).trim();
    const isProduction = process.env.NODE_ENV === 'production';

    if (!secret) {
      if (isProduction) {
        this.logger.error(
          'Ekart webhook auth failed: EKART_WEBHOOK_SECRET is not configured in production.',
        );
        throw new UnauthorizedException(
          'EKART_WEBHOOK_SECRET is not configured in production',
        );
      }
      this.logger.warn(
        'EKART_WEBHOOK_SECRET is not configured. Processing webhook in development mode.',
      );
      return true;
    }

    const signatureHeader = this.extractHeaderValue(headers, [
      'x-ekart-hmac',
      'x-ekart-signature',
      'x-hmac-signature',
      'x-webhook-signature',
    ]);

    if (!signatureHeader) {
      this.logger.warn('Ekart webhook rejected: Missing HMAC signature header.');
      throw new UnauthorizedException('Invalid or missing Ekart webhook signature');
    }

    const bodyStr = rawBody
      ? typeof rawBody === 'string'
        ? rawBody
        : rawBody.toString('utf8')
      : '';

    const computed = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    const sigBuffer = Buffer.from(signatureHeader);
    const computedBuffer = Buffer.from(computed);

    if (
      sigBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, computedBuffer)
    ) {
      this.logger.warn('Ekart webhook rejected: HMAC signature mismatch.');
      throw new UnauthorizedException('Invalid or missing Ekart webhook signature');
    }

    return true;
  }

  private extractHeaderValue(
    headers: Record<string, any>,
    candidateKeys: string[],
  ): string {
    if (!headers || typeof headers !== 'object') return '';
    const lowerKeys = candidateKeys.map((k) => k.toLowerCase());
    for (const [key, value] of Object.entries(headers)) {
      if (
        lowerKeys.includes(key.toLowerCase()) &&
        value !== undefined &&
        value !== null
      ) {
        return String(value).trim();
      }
    }
    return '';
  }

  extractPayloadFields(body: any) {
    if (!body || typeof body !== 'object') {
      return {
        trackingId: null,
        wbn: null,
        orderNumber: null,
        rawStatus: null,
        location: null,
        desc: null,
        attempts: null,
        edd: null,
        ctime: null,
      };
    }

    const trackingId = String(
      body.id || body.tracking_id || body.trackingId || '',
    ).trim() || null;

    const wbn = String(body.wbn || body.waybill || '').trim() || null;

    const orderNumber = String(
      body.orderNumber || body.order_number || '',
    ).trim() || null;

    const rawStatus = String(body.status || '').trim() || null;
    const location = String(body.location || '').trim() || null;
    const desc = String(body.desc || body.description || '').trim() || null;
    const attempts = body.attempts ?? null;
    const edd = body.edd ?? null;
    const ctime = body.ctime ?? null;

    return {
      trackingId,
      wbn,
      orderNumber,
      rawStatus,
      location,
      desc,
      attempts,
      edd,
      ctime,
    };
  }

  normalizeStatus(rawStatus?: string | null): OrderStatusEnum | null {
    if (!rawStatus) return null;

    const clean = rawStatus
      .trim()
      .toUpperCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ');

    if (EKART_STATUS_MAP[clean]) return EKART_STATUS_MAP[clean];

    if (clean.includes('DELIVERED') && !clean.includes('UNDELIVERED')) {
      return OrderStatusEnum.DELIVERED;
    }
    if (clean.includes('OUT FOR DELIVERY')) {
      return OrderStatusEnum.OUT_FOR_DELIVERY;
    }
    if (
      clean.includes('IN TRANSIT') ||
      clean.includes('DISPATCHED') ||
      clean.includes('REACHED')
    ) {
      return OrderStatusEnum.SHIPPED;
    }
    if (clean.includes('RTO') || clean.includes('RETURN TO ORIGIN')) {
      return clean.includes('DELIVERED')
        ? OrderStatusEnum.RETURNED
        : OrderStatusEnum.RETURN_INITIATED;
    }
    if (clean.includes('CANCEL')) {
      return OrderStatusEnum.CANCELLED;
    }

    return null;
  }

  canAdvanceStatus(
    currentStatus: OrderStatusEnum,
    newStatus: OrderStatusEnum,
  ): boolean {
    if (currentStatus === newStatus) return false;

    if (
      currentStatus === OrderStatusEnum.DELIVERED ||
      currentStatus === OrderStatusEnum.CANCELLED ||
      currentStatus === OrderStatusEnum.RETURNED
    ) {
      return false;
    }

    if (newStatus === OrderStatusEnum.CANCELLED) return true;

    if (
      newStatus === OrderStatusEnum.RETURN_INITIATED ||
      newStatus === OrderStatusEnum.RETURNED
    ) {
      return true;
    }

    const currentRank = STATUS_PROGRESSION_RANK[currentStatus] ?? 0;
    const newRank = STATUS_PROGRESSION_RANK[newStatus] ?? 0;
    return newRank > currentRank;
  }

  async findMatchingOrder(criteria: {
    trackingId?: string | null;
    wbn?: string | null;
    orderNumber?: string | null;
  }) {
    const { trackingId, wbn, orderNumber } = criteria;

    const awbCandidates = [trackingId, wbn].filter(Boolean) as string[];
    for (const awb of awbCandidates) {
      const returnRecord = await this.prisma.orderReturn.findFirst({
        where: { returnAwb: awb },
        include: {
          order: {
            include: {
              user: {
                select: { id: true, name: true, email: true, phone: true },
              },
              address: true,
            },
          },
        },
      });
      if (returnRecord) {
        return {
          order: returnRecord.order,
          matchedBy: 'returnAwb',
          orderReturn: returnRecord,
        };
      }

      const order = await this.prisma.order.findFirst({
        where: {
          OR: [{ trackingNumber: awb }, { shiprocketShipmentId: awb }],
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          address: true,
        },
      });
      if (order) return { order, matchedBy: 'awb', orderReturn: null };
    }

    if (orderNumber) {
      const order = await this.prisma.order.findUnique({
        where: { orderNumber },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          address: true,
        },
      });
      if (order)
        return { order, matchedBy: 'orderNumber', orderReturn: null };
    }

    return { order: null, matchedBy: null, orderReturn: null };
  }

  extractTrackingEvents(
    fields: ReturnType<typeof this.extractPayloadFields>,
  ): ParsedTrackingEvent[] {
    const events: ParsedTrackingEvent[] = [];

    if (fields.rawStatus) {
      const eventAt = fields.ctime
        ? parseProviderTimestamp(fields.ctime)
        : new Date();
      const normalized = this.normalizeStatus(fields.rawStatus);

      let stage: any = 'UPDATE';
      if (normalized === OrderStatusEnum.DELIVERED) stage = 'DELIVERED';
      else if (normalized === OrderStatusEnum.OUT_FOR_DELIVERY)
        stage = 'OUT_FOR_DELIVERY';
      else if (normalized === OrderStatusEnum.SHIPPED) stage = 'IN_TRANSIT';
      else if (normalized === OrderStatusEnum.PACKED) stage = 'PACKED';
      else if (normalized === OrderStatusEnum.RETURN_INITIATED)
        stage = 'RTO_INITIATED';
      else if (normalized === OrderStatusEnum.RETURNED)
        stage = 'RTO_DELIVERED';
      else if (normalized === OrderStatusEnum.CANCELLED) stage = 'CANCELLED';

      events.push({
        rawStatus: fields.rawStatus,
        stage,
        description: fields.desc || null,
        location: fields.location || null,
        eventAt: eventAt || new Date(),
      });
    }

    return events;
  }

  async processWebhook(
    options: ProcessEkartWebhookOptions,
  ): Promise<ProcessEkartWebhookResult> {
    const { headers, body, rawBody } = options;
    this.logger.log('Ekart webhook received.');

    this.verifyHmacSignature(headers, rawBody);

    const payloadObject = body && typeof body === 'object' ? body : {};
    const fields = this.extractPayloadFields(payloadObject);
    const { trackingId, wbn, orderNumber, rawStatus, ctime } = fields;

    if (!trackingId && !wbn && !orderNumber) {
      this.logger.log(
        'Ekart webhook test ping or configuration probe acknowledged.',
      );
      return {
        success: true,
        message: 'Ekart webhook test ping acknowledged successfully',
        matched: false,
        test: true,
      };
    }

    const { order, matchedBy, orderReturn } = await this.findMatchingOrder({
      trackingId,
      wbn,
      orderNumber,
    });

    if (!order) {
      this.logger.warn(
        `Ekart webhook unmatched: No order found for trackingId=${trackingId}, wbn=${wbn}, orderNumber=${orderNumber}.`,
      );

      const unmatchedEventId = `ekart_unmatched_${trackingId || wbn || orderNumber}_${rawStatus || 'status'}_${ctime || Date.now()}`;
      try {
        await this.prisma.webhookLog.create({
          data: {
            eventId: unmatchedEventId,
            event: `EKART_${rawStatus || 'UNMATCHED'}`,
            payload: JSON.parse(JSON.stringify(payloadObject)),
            status: 'UNMATCHED',
            processedAt: new Date(),
          },
        });
      } catch {
        // Ignore duplicate log entry
      }

      return {
        success: true,
        message:
          'Ekart webhook received but no matching KickAt order found.',
        matched: false,
      };
    }

    this.logger.log(
      `Ekart webhook matched order ${order.orderNumber} (id=${order.id}) via ${matchedBy}.`,
    );

    // Record tracking events
    if (this.trackingEventsService) {
      try {
        const events = this.extractTrackingEvents(fields);
        if (events.length > 0) {
          await this.trackingEventsService.recordEvents(order.id, events, {
            source: 'WEBHOOK',
            awb: trackingId || wbn || order.trackingNumber,
            shipmentId: order.shiprocketShipmentId,
          });
        }
      } catch (trackErr: unknown) {
        const msg =
          trackErr instanceof Error ? trackErr.message : String(trackErr);
        this.logger.warn(
          `Failed to persist Ekart tracking events for order ${order.orderNumber}: ${msg}`,
        );
      }
    }

    // Idempotency
    const eventId = `ekart_${order.id}_${trackingId || wbn || 'noawb'}_${rawStatus || 'status'}_${ctime || ''}`;

    const existingLog = await this.prisma.webhookLog.findUnique({
      where: { eventId },
    });

    if (existingLog) {
      this.logger.log(
        `Duplicate Ekart webhook event ignored (eventId=${eventId}).`,
      );
      return {
        success: true,
        message: 'Webhook event already processed',
        duplicate: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
      };
    }

    // Normalize status
    const normalizedStatus = this.normalizeStatus(rawStatus);
    if (rawStatus && !normalizedStatus) {
      this.logger.warn(
        `Unknown Ekart status: "${rawStatus}" for order ${order.orderNumber}.`,
      );
    }

    // Check progression
    let shouldAdvanceStatus = false;
    if (normalizedStatus) {
      if (this.canAdvanceStatus(order.orderStatus, normalizedStatus)) {
        shouldAdvanceStatus = true;
      } else {
        this.logger.log(
          `Ignored backward/invalid status transition from ${order.orderStatus} to ${normalizedStatus} for order ${order.orderNumber}.`,
        );
      }
    }

    // Build update payload
    const updateData: Prisma.OrderUpdateInput = {};

    const awb = trackingId || wbn;
    if (awb && !order.trackingNumber) {
      updateData.trackingNumber = awb;
    }
    if (!order.courierPartner) {
      updateData.courierPartner = 'Ekart';
    }
    if (!order.shippingProvider) {
      updateData.shippingProvider = 'EKART';
    }

    if (shouldAdvanceStatus && normalizedStatus) {
      updateData.orderStatus = normalizedStatus;
      if (normalizedStatus === OrderStatusEnum.DELIVERED) {
        const delDate = ctime ? new Date(ctime) : new Date();
        updateData.deliveryDate = isNaN(delDate.getTime())
          ? new Date()
          : delDate;
        if (
          order.paymentMethod === PaymentMethodEnum.COD &&
          order.paymentStatus === PaymentStatusEnum.PENDING
        ) {
          updateData.paymentStatus = PaymentStatusEnum.COMPLETED;
        }
      }
    }

    // Transaction
    let updatedOrder = order;
    try {
      updatedOrder = await this.prisma.$transaction(async (tx) => {
        await tx.webhookLog.create({
          data: {
            eventId,
            event: `EKART_${rawStatus || 'UPDATE'}`,
            payload: JSON.parse(JSON.stringify(payloadObject)),
            status: 'SUCCESS',
            processedAt: new Date(),
          },
        });

        if (Object.keys(updateData).length > 0) {
          const res = await tx.order.update({
            where: { id: order.id },
            data: updateData,
            include: {
              user: {
                select: { id: true, name: true, email: true, phone: true },
              },
              address: true,
            },
          });

          if (updateData.paymentStatus === PaymentStatusEnum.COMPLETED) {
            await tx.payment.updateMany({
              where: { orderId: order.id, status: PaymentStatusEnum.PENDING },
              data: { status: PaymentStatusEnum.COMPLETED },
            });
          }

          return res;
        }

        return order;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        this.logger.log(
          `Concurrent duplicate Ekart webhook event caught for eventId=${eventId}.`,
        );
        return {
          success: true,
          message: 'Webhook event already processed',
          duplicate: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
        };
      }
      this.logger.error(
        `Ekart webhook transaction failed for order ${order.orderNumber}: ${err.message}`,
        err.stack,
      );
      throw err;
    }

    // Notifications
    if (
      shouldAdvanceStatus &&
      normalizedStatus &&
      updatedOrder.orderStatus !== order.orderStatus
    ) {
      this.logger.log(
        `Shipment status updated for order ${order.orderNumber}: ${order.orderStatus} -> ${updatedOrder.orderStatus}.`,
      );

      try {
        this.notificationsService.notifyOrderStatusChange({
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          userId: updatedOrder.userId,
          oldStatus: order.orderStatus,
          newStatus: updatedOrder.orderStatus,
          trackingNumber: updatedOrder.trackingNumber,
          courierPartner: updatedOrder.courierPartner || 'Ekart',
        });
      } catch (notifyErr: unknown) {
        const msg =
          notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        this.logger.warn(
          `Failed to dispatch status notification for order ${order.orderNumber}: ${msg}`,
        );
      }
    }

    return {
      success: true,
      message: 'Ekart webhook processed successfully',
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      matched: true,
    };
  }
}
