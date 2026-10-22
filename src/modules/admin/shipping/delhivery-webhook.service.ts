import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import * as crypto from "crypto";
import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { ParsedTrackingEvent, parseProviderTimestamp } from "./tracking-events.util";

/**
 * Normalization map for Delhivery status strings and StatusType codes to KickAt OrderStatusEnum.
 */
export const DELHIVERY_STATUS_MAP: Record<string, OrderStatusEnum> = {
  // Terminal Delivered
  "DELIVERED": OrderStatusEnum.DELIVERED,
  "DL": OrderStatusEnum.DELIVERED,

  // Out for Delivery
  "OUT FOR DELIVERY": OrderStatusEnum.OUT_FOR_DELIVERY,
  "OUT_FOR_DELIVERY": OrderStatusEnum.OUT_FOR_DELIVERY,
  "OFD": OrderStatusEnum.OUT_FOR_DELIVERY,

  // Shipped / In-Transit milestones
  "IN TRANSIT": OrderStatusEnum.SHIPPED,
  "IN_TRANSIT": OrderStatusEnum.SHIPPED,
  "IN-TRANSIT": OrderStatusEnum.SHIPPED,
  "TRANSIT": OrderStatusEnum.SHIPPED,
  "DISPATCHED": OrderStatusEnum.SHIPPED,
  "PICKED UP": OrderStatusEnum.SHIPPED,
  "PICKED_UP": OrderStatusEnum.SHIPPED,
  "PICKUP DONE": OrderStatusEnum.SHIPPED,
  "REACHED AT HUB": OrderStatusEnum.SHIPPED,
  "REACHED AT DESTINATION": OrderStatusEnum.SHIPPED,
  "PENDING": OrderStatusEnum.SHIPPED,

  // Packed / Manifested milestones
  "MANIFESTED": OrderStatusEnum.PACKED,
  "AWB ASSIGNED": OrderStatusEnum.PACKED,
  "READY TO SHIP": OrderStatusEnum.PACKED,
  "PICKUP SCHEDULED": OrderStatusEnum.PACKED,
  "PICKUP PENDING": OrderStatusEnum.PACKED,

  // Cancellation milestone
  "CANCELLED": OrderStatusEnum.CANCELLED,
  "CANCELED": OrderStatusEnum.CANCELLED,
  "CN": OrderStatusEnum.CANCELLED,

  // Return / RTO milestones
  "RTO": OrderStatusEnum.RETURN_INITIATED,
  "RT": OrderStatusEnum.RETURN_INITIATED,
  "RTO INITIATED": OrderStatusEnum.RETURN_INITIATED,
  "RTO_INITIATED": OrderStatusEnum.RETURN_INITIATED,
  "RTO IN TRANSIT": OrderStatusEnum.RETURN_INITIATED,
  "RTO OUT FOR DELIVERY": OrderStatusEnum.RETURN_INITIATED,
  "RTO DELIVERED": OrderStatusEnum.RETURNED,
  "RTO_DELIVERED": OrderStatusEnum.RETURNED,
  "RETURNED": OrderStatusEnum.RETURNED,
};

/**
 * Progression rank to prevent backward movement in the shipping lifecycle.
 */
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
  [OrderStatusEnum.CANCELLED]: 100, // Terminal
};

export interface ProcessDelhiveryWebhookOptions {
  headers: Record<string, any>;
  body: any;
  rawBody?: string | Buffer;
}

export interface ProcessDelhiveryWebhookResult {
  success: boolean;
  message: string;
  duplicate?: boolean;
  orderId?: string;
  orderNumber?: string;
  matched?: boolean;
  test?: boolean;
}

@Injectable()
export class DelhiveryWebhookService {
  private readonly logger = new Logger(DelhiveryWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly trackingEventsService?: OrderTrackingEventsService,
  ) {}

  /**
   * Helper to safely extract a header value case-insensitively.
   */
  private extractHeaderValue(
    headers: Record<string, any>,
    candidateKeys: string[],
  ): string {
    if (!headers || typeof headers !== "object") return "";

    const lowerKeys = candidateKeys.map((k) => k.toLowerCase());
    for (const [key, value] of Object.entries(headers)) {
      if (lowerKeys.includes(key.toLowerCase()) && value !== undefined && value !== null) {
        return String(value).trim();
      }
    }
    return "";
  }

  /**
   * Validates webhook authentication headers against the configured secret.
   * Delhivery supports custom authorization headers configured on their merchant portal
   * (typically X-Delhivery-Secret, Authorization: Bearer <secret>, or X-Api-Key).
   */
  verifyAuthentication(headers: Record<string, any>): boolean {
    const rawConfiguredSecret = (
      this.configService.get<string>("DELHIVERY_WEBHOOK_SECRET") ||
      this.configService.get<string>("DELHIVERY_WEBHOOK_TOKEN") ||
      ""
    ).trim();

    const configuredSecret = rawConfiguredSecret.replace(/^["']|["']$/g, "").trim();
    const isProduction = process.env.NODE_ENV === "production";

    if (!configuredSecret) {
      if (isProduction) {
        this.logger.error(
          "Delhivery webhook authentication failed: DELHIVERY_WEBHOOK_SECRET is not configured in production.",
        );
        throw new UnauthorizedException(
          "DELHIVERY_WEBHOOK_SECRET is not configured in production",
        );
      }
      this.logger.warn(
        "DELHIVERY_WEBHOOK_SECRET is not configured. Processing webhook in development mode.",
      );
      return true;
    }

    let incomingKey = this.extractHeaderValue(headers, [
      "x-delhivery-secret",
      "x_delhivery_secret",
      "x-delhivery-token",
      "x-api-key",
      "x_api_key",
      "authorization",
      "token",
    ]);

    incomingKey = incomingKey.replace(/^["']|["']$/g, "").trim();
    if (incomingKey.toLowerCase().startsWith("bearer ")) {
      incomingKey = incomingKey.substring(7).trim();
    } else if (incomingKey.toLowerCase().startsWith("token ")) {
      incomingKey = incomingKey.substring(6).trim();
    }

    if (!incomingKey) {
      this.logger.warn(
        "Delhivery webhook rejected: Missing authentication header (expected X-Delhivery-Secret or Authorization).",
      );
      throw new UnauthorizedException(
        "Invalid or missing Delhivery webhook secret",
      );
    }

    const configuredBuffer = Buffer.from(configuredSecret);
    const incomingBuffer = Buffer.from(incomingKey);

    if (
      configuredBuffer.length !== incomingBuffer.length ||
      !crypto.timingSafeEqual(configuredBuffer, incomingBuffer)
    ) {
      this.logger.warn(
        "Delhivery webhook rejected: Security token mismatch.",
      );
      throw new UnauthorizedException(
        "Invalid or missing Delhivery webhook secret",
      );
    }

    return true;
  }

  /**
   * Extracts tracking and scan details from Delhivery webhook payload.
   * Delhivery payloads typically wrap data inside a `Shipment` root or deliver directly:
   * {
   *   "Shipment": {
   *     "AWB": "...",
   *     "ReferenceNo": "ORD-1234",
   *     "Status": {
   *       "Status": "In Transit",
   *       "StatusDateTime": "...",
   *       "StatusType": "UD",
   *       "StatusLocation": "...",
   *       "Instructions": "..."
   *     },
   *     "Scans": [...]
   *   }
   * }
   */
  extractPayloadFields(body: any) {
    if (!body || typeof body !== "object") {
      return {
        awb: null,
        orderNumber: null,
        rawStatus: null,
        statusType: null,
        statusDateTime: null,
        location: null,
        instructions: null,
        scans: [],
      };
    }

    const shipment = body.Shipment || body.shipment || body.data || body;
    const statusObj = shipment.Status || shipment.status || {};

    const awb = String(
      shipment.AWB ||
      shipment.awb ||
      shipment.Waybill ||
      shipment.waybill ||
      body.AWB ||
      body.waybill ||
      "",
    ).trim() || null;

    const orderNumber = String(
      shipment.ReferenceNo ||
      shipment.reference_no ||
      shipment.OrderNo ||
      shipment.order_no ||
      shipment.order ||
      body.ReferenceNo ||
      body.order ||
      "",
    ).trim() || null;

    const rawStatus = typeof statusObj === "object"
      ? String(statusObj.Status || statusObj.status || "").trim() || null
      : String(statusObj || "").trim() || null;

    const statusType = typeof statusObj === "object"
      ? String(statusObj.StatusType || statusObj.status_type || "").trim() || null
      : null;

    const statusDateTime = typeof statusObj === "object"
      ? String(statusObj.StatusDateTime || statusObj.status_date_time || shipment.PickUpDate || "").trim() || null
      : null;

    const location = typeof statusObj === "object"
      ? String(statusObj.StatusLocation || statusObj.status_location || statusObj.ScannedLocation || "").trim() || null
      : null;

    const instructions = typeof statusObj === "object"
      ? String(statusObj.Instructions || statusObj.instructions || "").trim() || null
      : null;

    const scans = Array.isArray(shipment.Scans)
      ? shipment.Scans
      : Array.isArray(shipment.scans)
      ? shipment.scans
      : Array.isArray(body.Scans)
      ? body.Scans
      : [];

    return {
      awb,
      orderNumber,
      rawStatus,
      statusType,
      statusDateTime,
      location,
      instructions,
      scans,
    };
  }

  /**
   * Resolves the matching KickAt Order by Delhivery AWB / Waybill or ReferenceNo.
   */
  async findMatchingOrder(criteria: {
    awb?: string | null;
    orderNumber?: string | null;
  }) {
    const { awb, orderNumber } = criteria;

    if (awb) {
      const order = await this.prisma.order.findFirst({
        where: {
          OR: [
            { trackingNumber: awb },
            { shiprocketShipmentId: awb }, // Delhivery provider sets shipmentId = awb
          ],
        },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "awb" };
    }

    if (orderNumber) {
      const order = await this.prisma.order.findUnique({
        where: { orderNumber },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "orderNumber" };
    }

    return { order: null, matchedBy: null };
  }

  /**
   * Maps Delhivery raw status and StatusType code to OrderStatusEnum.
   */
  normalizeStatus(
    rawStatus?: string | null,
    statusType?: string | null,
  ): OrderStatusEnum | null {
    if (statusType) {
      const cleanType = statusType.trim().toUpperCase();
      if (cleanType === "DL") return OrderStatusEnum.DELIVERED;
      if (cleanType === "RT") return OrderStatusEnum.RETURN_INITIATED;
      if (cleanType === "CN") return OrderStatusEnum.CANCELLED;
      // Note: 'UD' indicates undelivered/attempted, which keeps current status (e.g. OUT_FOR_DELIVERY) or remains SHIPPED
    }

    if (rawStatus) {
      const clean = rawStatus.trim().toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
      if (DELHIVERY_STATUS_MAP[clean]) {
        return DELHIVERY_STATUS_MAP[clean];
      }
      if (clean.includes("DELIVERED") && !clean.includes("UNDELIVERED")) {
        return OrderStatusEnum.DELIVERED;
      }
      if (clean.includes("OUT FOR DELIVERY")) {
        return OrderStatusEnum.OUT_FOR_DELIVERY;
      }
      if (clean.includes("IN TRANSIT") || clean.includes("DISPATCHED") || clean.includes("REACHED")) {
        return OrderStatusEnum.SHIPPED;
      }
      if (clean.includes("RTO") || clean.includes("RETURN TO ORIGIN")) {
        return clean.includes("DELIVERED") ? OrderStatusEnum.RETURNED : OrderStatusEnum.RETURN_INITIATED;
      }
      if (clean.includes("CANCEL")) {
        return OrderStatusEnum.CANCELLED;
      }
      if (clean.includes("MANIFEST") || clean.includes("AWB ASSIGNED")) {
        return OrderStatusEnum.PACKED;
      }
    }

    return null;
  }

  /**
   * Prevents invalid or backward progression in the order shipping lifecycle.
   */
  canAdvanceStatus(
    currentStatus: OrderStatusEnum,
    newStatus: OrderStatusEnum,
  ): boolean {
    if (currentStatus === newStatus) return false;

    // Terminal statuses cannot be transitioned out
    if (
      currentStatus === OrderStatusEnum.DELIVERED ||
      currentStatus === OrderStatusEnum.CANCELLED ||
      currentStatus === OrderStatusEnum.RETURNED
    ) {
      return false;
    }

    // Cancellation is allowed prior to delivery
    if (newStatus === OrderStatusEnum.CANCELLED) {
      return true;
    }

    // RTO flow allowed once shipped or out for delivery
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

  /**
   * Extracts parsed tracking events from Delhivery scans array and current status.
   */
  extractTrackingEvents(fields: ReturnType<typeof this.extractPayloadFields>): ParsedTrackingEvent[] {
    const events: ParsedTrackingEvent[] = [];

    if (Array.isArray(fields.scans)) {
      for (const item of fields.scans) {
        const detail = item?.ScanDetail || item;
        if (!detail) continue;

        const scanStatus = String(detail.Scan || detail.Instructions || "").trim();
        const scanLocation = String(detail.ScannedLocation || "").trim() || null;
        const scanDateStr = detail.ScanDateTime || detail.StatusDateTime;
        const eventAt = parseProviderTimestamp(scanDateStr);

        if (scanStatus && eventAt) {
          const normalized = this.normalizeStatus(scanStatus, detail.ScanType);
          let stage: any = 'UPDATE';
          if (normalized === OrderStatusEnum.DELIVERED) stage = 'DELIVERED';
          else if (normalized === OrderStatusEnum.OUT_FOR_DELIVERY) stage = 'OUT_FOR_DELIVERY';
          else if (normalized === OrderStatusEnum.SHIPPED) stage = 'IN_TRANSIT';
          else if (normalized === OrderStatusEnum.PACKED) stage = 'PACKED';
          else if (normalized === OrderStatusEnum.RETURN_INITIATED) stage = 'RTO_INITIATED';
          else if (normalized === OrderStatusEnum.RETURNED) stage = 'RTO_DELIVERED';
          else if (normalized === OrderStatusEnum.CANCELLED) stage = 'CANCELLED';

          events.push({
            rawStatus: scanStatus,
            stage,
            description: detail.Instructions || null,
            location: scanLocation,
            eventAt,
          });
        }
      }
    }

    if (fields.rawStatus) {
      const eventAt = parseProviderTimestamp(fields.statusDateTime) || new Date();
      const normalized = this.normalizeStatus(fields.rawStatus, fields.statusType);
      let stage: any = 'UPDATE';
      if (normalized === OrderStatusEnum.DELIVERED) stage = 'DELIVERED';
      else if (normalized === OrderStatusEnum.OUT_FOR_DELIVERY) stage = 'OUT_FOR_DELIVERY';
      else if (normalized === OrderStatusEnum.SHIPPED) stage = 'IN_TRANSIT';
      else if (normalized === OrderStatusEnum.PACKED) stage = 'PACKED';
      else if (normalized === OrderStatusEnum.RETURN_INITIATED) stage = 'RTO_INITIATED';
      else if (normalized === OrderStatusEnum.RETURNED) stage = 'RTO_DELIVERED';
      else if (normalized === OrderStatusEnum.CANCELLED) stage = 'CANCELLED';

      const alreadyCovered = events.some(
        (e) => e.rawStatus.toUpperCase() === fields.rawStatus?.toUpperCase(),
      );

      if (!alreadyCovered) {
        events.push({
          rawStatus: fields.rawStatus,
          stage,
          description: fields.instructions || null,
          location: fields.location || null,
          eventAt,
        });
      }
    }

    return events;
  }

  /**
   * Main Delhivery webhook processor.
   */
  async processWebhook(options: ProcessDelhiveryWebhookOptions): Promise<ProcessDelhiveryWebhookResult> {
    const { headers, body } = options;
    this.logger.log("Delhivery webhook received.");

    // 1. Authenticate request
    this.verifyAuthentication(headers);

    // 2. Validate payload safely
    const payloadObject = body && typeof body === "object" ? body : {};
    const fields = this.extractPayloadFields(payloadObject);
    const { awb, orderNumber, rawStatus, statusType, statusDateTime } = fields;

    // 3. Check for dashboard ping / test probe without identifiers
    if (!awb && !orderNumber) {
      this.logger.log("Delhivery webhook test ping or configuration probe acknowledged.");
      return {
        success: true,
        message: "Delhivery webhook test ping acknowledged successfully",
        matched: false,
        test: true,
      };
    }

    // 4. Match KickAt Order
    const { order, matchedBy } = await this.findMatchingOrder({ awb, orderNumber });

    if (!order) {
      this.logger.warn(
        `Delhivery webhook unmatched: No order found for awb=${awb}, orderNumber=${orderNumber}.`,
      );

      const unmatchedEventId =
        this.extractHeaderValue(headers, ["x-delhivery-event-id", "x-event-id", "x-webhook-id"]) ||
        `delhivery_unmatched_${awb || orderNumber}_${rawStatus || statusType || "status"}_${statusDateTime || Date.now()}`;

      try {
        await this.prisma.webhookLog.create({
          data: {
            eventId: unmatchedEventId,
            event: `DELHIVERY_${rawStatus || statusType || "UNMATCHED"}`,
            payload: JSON.parse(JSON.stringify(payloadObject || {})),
            status: "UNMATCHED",
            processedAt: new Date(),
          },
        });
      } catch {
        // Ignore duplicate log entry on unmatched events
      }

      return {
        success: true,
        message: "Delhivery webhook received but no matching KickAt order found.",
        matched: false,
      };
    }

    this.logger.log(
      `Delhivery webhook matched order ${order.orderNumber} (id=${order.id}) via ${matchedBy}.`,
    );

    // 4b. Record courier scan events for tracking timeline
    if (this.trackingEventsService) {
      try {
        const events = this.extractTrackingEvents(fields);
        if (events.length > 0) {
          await this.trackingEventsService.recordEvents(
            order.id,
            events,
            {
              source: "WEBHOOK",
              awb: awb || order.trackingNumber,
              shipmentId: order.shiprocketShipmentId,
            },
          );
        }
      } catch (trackErr: any) {
        this.logger.warn(
          `Failed to persist Delhivery tracking events for order ${order.orderNumber}: ${trackErr?.message || trackErr}`,
        );
      }
    }

    // 5. Idempotency Check: Construct unique event ID
    const eventId =
      this.extractHeaderValue(headers, ["x-delhivery-event-id", "x-event-id", "x-webhook-id"]) ||
      `delhivery_${order.id}_${awb || "noawb"}_${rawStatus || statusType || "status"}_${statusDateTime || ""}`;

    const existingLog = await this.prisma.webhookLog.findUnique({
      where: { eventId },
    });

    if (existingLog) {
      this.logger.log(
        `Duplicate Delhivery webhook event ignored (eventId=${eventId}, order=${order.orderNumber}).`,
      );
      return {
        success: true,
        message: "Webhook event already processed",
        duplicate: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
      };
    }

    // 6. Normalize status
    const normalizedStatus = this.normalizeStatus(rawStatus, statusType);
    if (rawStatus && !normalizedStatus) {
      this.logger.warn(
        `Unknown Delhivery status received: "${rawStatus}" (statusType: ${statusType}) for order ${order.orderNumber}.`,
      );
    }

    // 7. Check progression safety
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

    // 8. Build update payload
    const updateData: Prisma.OrderUpdateInput = {};

    if (awb && awb.trim() && !order.trackingNumber) {
      updateData.trackingNumber = awb.trim();
    }
    if (!order.courierPartner) {
      updateData.courierPartner = "Delhivery";
    }
    if (!order.shippingProvider) {
      updateData.shippingProvider = "DELHIVERY";
    }
    if (shouldAdvanceStatus && normalizedStatus) {
      updateData.orderStatus = normalizedStatus;
      if (normalizedStatus === OrderStatusEnum.DELIVERED) {
        const delDate = statusDateTime ? new Date(statusDateTime) : new Date();
        updateData.deliveryDate = isNaN(delDate.getTime()) ? new Date() : delDate;
        if (
          order.paymentMethod === PaymentMethodEnum.COD &&
          order.paymentStatus === PaymentStatusEnum.PENDING
        ) {
          updateData.paymentStatus = PaymentStatusEnum.COMPLETED;
        }
      }
    }

    // 9. Database transaction for Order update and WebhookLog creation
    let updatedOrder = order;
    try {
      updatedOrder = await this.prisma.$transaction(async (tx) => {
        await tx.webhookLog.create({
          data: {
            eventId,
            event: `DELHIVERY_${rawStatus || statusType || "UPDATE"}`,
            payload: JSON.parse(JSON.stringify(payloadObject || {})),
            status: "SUCCESS",
            processedAt: new Date(),
          },
        });

        if (Object.keys(updateData).length > 0) {
          const res = await tx.order.update({
            where: { id: order.id },
            data: updateData,
            include: {
              user: { select: { id: true, name: true, email: true, phone: true } },
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
      if (err?.code === "P2002") {
        this.logger.log(
          `Concurrent duplicate Delhivery webhook event caught for eventId=${eventId}.`,
        );
        return {
          success: true,
          message: "Webhook event already processed",
          duplicate: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
        };
      }
      this.logger.error(
        `Delhivery webhook transaction failed for order ${order.orderNumber}: ${err.message}`,
        err.stack,
      );
      throw err;
    }

    // 10. Send customer notifications if status changed
    if (shouldAdvanceStatus && normalizedStatus && updatedOrder.orderStatus !== order.orderStatus) {
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
          courierPartner: updatedOrder.courierPartner || "Delhivery",
        });
      } catch (notifyErr: any) {
        this.logger.warn(
          `Failed to dispatch status notification for order ${order.orderNumber}: ${notifyErr?.message || notifyErr}`,
        );
      }
    }

    return {
      success: true,
      message: "Delhivery webhook processed successfully",
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      matched: true,
    };
  }
}
