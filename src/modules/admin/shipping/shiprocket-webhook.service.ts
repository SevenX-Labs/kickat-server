import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderStatusEnum, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import * as crypto from "crypto";
import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { extractShiprocketWebhookEvents } from "./tracking-events.util";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Normalization map for Shiprocket status strings to KickAt OrderStatusEnum.
 */
export const SHIPROCKET_STATUS_MAP: Record<string, OrderStatusEnum> = {
  // Shipped / In-Transit milestones
  "SHIPPED": OrderStatusEnum.SHIPPED,
  "PICKED UP": OrderStatusEnum.SHIPPED,
  "PICKED_UP": OrderStatusEnum.SHIPPED,
  "PICKUP DONE": OrderStatusEnum.SHIPPED,
  "IN TRANSIT": OrderStatusEnum.SHIPPED,
  "IN_TRANSIT": OrderStatusEnum.SHIPPED,
  "IN-TRANSIT": OrderStatusEnum.SHIPPED,
  "REACHED AT HUB": OrderStatusEnum.SHIPPED,
  "REACHED AT DESTINATION": OrderStatusEnum.SHIPPED,
  "REACHED AT DESTINATION HUB": OrderStatusEnum.SHIPPED,
  "HANDOVER TO COURIER": OrderStatusEnum.SHIPPED,
  "DISPATCHED": OrderStatusEnum.SHIPPED,

  // Out for Delivery milestone
  "OUT FOR DELIVERY": OrderStatusEnum.OUT_FOR_DELIVERY,
  "OUT_FOR_DELIVERY": OrderStatusEnum.OUT_FOR_DELIVERY,

  // Delivered milestone
  "DELIVERED": OrderStatusEnum.DELIVERED,

  // Packed / Ready to Ship milestones
  "AWB ASSIGNED": OrderStatusEnum.PACKED,
  "LABEL GENERATED": OrderStatusEnum.PACKED,
  "MANIFEST GENERATED": OrderStatusEnum.PACKED,
  "READY TO SHIP": OrderStatusEnum.PACKED,
  "PICKUP SCHEDULED": OrderStatusEnum.PACKED,
  "PICKUP QUEUED": OrderStatusEnum.PACKED,
  "PACKED": OrderStatusEnum.PACKED,
  "OUT FOR PICKUP": OrderStatusEnum.PACKED,
  "NEW": OrderStatusEnum.PLACED,

  // Cancellation milestone
  "CANCELED": OrderStatusEnum.CANCELLED,
  "CANCELLED": OrderStatusEnum.CANCELLED,

  // Return / RTO milestones
  "RTO INITIATED": OrderStatusEnum.RETURN_INITIATED,
  "RTO_INITIATED": OrderStatusEnum.RETURN_INITIATED,
  "RTO IN TRANSIT": OrderStatusEnum.RETURN_INITIATED,
  "RTO IN-TRANSIT": OrderStatusEnum.RETURN_INITIATED,
  "RTO OUT FOR DELIVERY": OrderStatusEnum.RETURN_INITIATED,
  "RTO ACKNOWLEDGED": OrderStatusEnum.RETURN_INITIATED,
  "RTO DELIVERED": OrderStatusEnum.RETURNED,
  "RTO_DELIVERED": OrderStatusEnum.RETURNED,
  "RETURNED": OrderStatusEnum.RETURNED,
};

/**
 * Fallback mapping for Shiprocket numeric status codes.
 */
export const SHIPROCKET_STATUS_CODE_MAP: Record<number, OrderStatusEnum> = {
  1: OrderStatusEnum.PACKED, // AWB Assigned
  2: OrderStatusEnum.PACKED, // Label Generated
  3: OrderStatusEnum.PACKED, // Pickup Scheduled
  4: OrderStatusEnum.PACKED, // Pickup Queued
  5: OrderStatusEnum.PACKED, // Manifest Generated
  6: OrderStatusEnum.SHIPPED, // Shipped / Picked Up
  7: OrderStatusEnum.DELIVERED, // Delivered
  8: OrderStatusEnum.CANCELLED, // Cancelled
  9: OrderStatusEnum.RETURN_INITIATED, // RTO Initiated
  10: OrderStatusEnum.RETURNED, // RTO Delivered
  11: OrderStatusEnum.SHIPPED, // Pending / In Transit
  14: OrderStatusEnum.RETURN_INITIATED, // RTO Acknowledged
  15: OrderStatusEnum.OUT_FOR_DELIVERY, // Reached at Destination
  17: OrderStatusEnum.OUT_FOR_DELIVERY, // Out for Delivery
  18: OrderStatusEnum.SHIPPED, // In Transit
  19: OrderStatusEnum.SHIPPED, // Reached Destination
  20: OrderStatusEnum.PACKED, // Out for Pickup
  21: OrderStatusEnum.PACKED, // Pickup Rescheduled
  22: OrderStatusEnum.RETURN_INITIATED, // RTO In Transit
  38: OrderStatusEnum.SHIPPED, // Reached Hub
  42: OrderStatusEnum.SHIPPED, // Picked Up
  43: OrderStatusEnum.SHIPPED, // Handover to Courier
  46: OrderStatusEnum.SHIPPED, // In Transit
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

export interface ProcessWebhookOptions {
  headers: Record<string, any>;
  body: any;
  rawBody?: string | Buffer;
}

export interface ProcessWebhookResult {
  success: boolean;
  message: string;
  matched?: boolean;
  duplicate?: boolean;
  test?: boolean;
  orderId?: string;
  orderNumber?: string;
  oldStatus?: OrderStatusEnum;
  newStatus?: OrderStatusEnum;
  statusUpdated?: boolean;
  trackingNumber?: string | null;
  courierPartner?: string | null;
}

@Injectable()
export class ShiprocketWebhookService {
  private readonly logger = new Logger(ShiprocketWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Optional()
    private readonly trackingEventsService?: OrderTrackingEventsService,
  ) {}

  /**
   * Safely searches headers in a case-insensitive manner for candidate key names.
   */
  private extractHeaderValue(
    headers: Record<string, any>,
    candidateKeys: string[],
  ): string {
    if (!headers || typeof headers !== "object") return "";

    const lowerMap = new Map<string, string>();
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined && v !== null) {
        lowerMap.set(k.toLowerCase().trim(), String(v).trim());
      }
    }

    for (const candidate of candidateKeys) {
      const match = lowerMap.get(candidate.toLowerCase().trim());
      if (match) return match;
    }

    return "";
  }

  /**
   * Validates webhook authentication headers against the configured secret.
   * Shiprocket passes configured webhook security token via `x-api-key` header.
   */
  verifyAuthentication(headers: Record<string, any>): boolean {
    const rawConfiguredSecret = (
      this.configService.get<string>("SHIPROCKET_WEBHOOK_SECRET") ||
      this.configService.get<string>("SHIPROCKET_WEBHOOK_TOKEN") ||
      this.configService.get<string>("SHIPROCKET_API_KEY") ||
      ""
    ).trim();

    // Strip optional surrounding quotes in configured secret
    const configuredSecret = rawConfiguredSecret.replace(/^["']|["']$/g, "").trim();

    const isProduction = process.env.NODE_ENV === "production";
    if (!configuredSecret) {
      if (isProduction) {
        this.logger.error(
          "Shiprocket webhook authentication failed: SHIPROCKET_WEBHOOK_SECRET is not configured in production.",
        );
        throw new UnauthorizedException(
          "SHIPROCKET_WEBHOOK_SECRET is not configured in production",
        );
      }
      this.logger.warn(
        "SHIPROCKET_WEBHOOK_SECRET is not configured. Processing webhook in development mode.",
      );
      return true;
    }

    // Extract incoming key from headers case-insensitively
    let incomingKey = this.extractHeaderValue(headers, [
      "x-api-key",
      "x_api_key",
      "x-api-token",
      "x-shiprocket-token",
      "api-key",
      "apikey",
      "token",
      "authorization",
    ]);

    // Strip optional quotes
    incomingKey = incomingKey.replace(/^["']|["']$/g, "").trim();

    // If Authorization header is used with Bearer prefix
    if (incomingKey.toLowerCase().startsWith("bearer ")) {
      incomingKey = incomingKey.substring(7).trim();
    }

    if (!incomingKey) {
      this.logger.warn(
        "Shiprocket webhook rejected: Missing authentication header (expected x-api-key).",
      );
      throw new UnauthorizedException(
        "Invalid or missing Shiprocket webhook secret",
      );
    }

    // Constant-time comparison to prevent timing attacks
    const configuredBuffer = Buffer.from(configuredSecret);
    const incomingBuffer = Buffer.from(incomingKey);

    if (
      configuredBuffer.length !== incomingBuffer.length ||
      !crypto.timingSafeEqual(configuredBuffer, incomingBuffer)
    ) {
      this.logger.warn(
        "Shiprocket webhook rejected: Security token mismatch in x-api-key header.",
      );
      throw new UnauthorizedException(
        "Invalid or missing Shiprocket webhook secret",
      );
    }

    return true;
  }

  /**
   * Normalizes raw Shiprocket status string or status code to KickAt OrderStatusEnum.
   */
  normalizeStatus(
    rawStatus?: string | null,
    statusCode?: number | string | null,
  ): OrderStatusEnum | null {
    if (rawStatus && typeof rawStatus === "string") {
      const cleaned = rawStatus.trim().toUpperCase().replace(/[-_]+/g, " ");

      // 1. Direct map lookup
      if (SHIPROCKET_STATUS_MAP[cleaned]) {
        return SHIPROCKET_STATUS_MAP[cleaned];
      }

      // 2. Pattern matches
      if (cleaned.includes("DELIVERED") && !cleaned.includes("RTO")) {
        return OrderStatusEnum.DELIVERED;
      }
      if (cleaned.includes("OUT FOR DELIVERY")) {
        return OrderStatusEnum.OUT_FOR_DELIVERY;
      }
      if (
        cleaned.includes("PICKED UP") ||
        cleaned.includes("PICKUP DONE") ||
        cleaned.includes("IN TRANSIT") ||
        cleaned.includes("REACHED") ||
        cleaned.includes("SHIPPED") ||
        cleaned.includes("DISPATCH")
      ) {
        return OrderStatusEnum.SHIPPED;
      }
      if (cleaned.includes("RTO DELIVERED")) {
        return OrderStatusEnum.RETURNED;
      }
      if (cleaned.includes("RTO")) {
        return OrderStatusEnum.RETURN_INITIATED;
      }
      if (cleaned.includes("CANCEL")) {
        return OrderStatusEnum.CANCELLED;
      }
      if (
        cleaned.includes("MANIFEST") ||
        cleaned.includes("AWB ASSIGNED") ||
        cleaned.includes("LABEL GENERATED") ||
        cleaned.includes("READY TO SHIP") ||
        cleaned.includes("PACKED")
      ) {
        return OrderStatusEnum.PACKED;
      }
    }

    // Fallback to numeric status code
    if (statusCode !== undefined && statusCode !== null) {
      const num = typeof statusCode === "number" ? statusCode : parseInt(String(statusCode), 10);
      if (!isNaN(num) && SHIPROCKET_STATUS_CODE_MAP[num]) {
        return SHIPROCKET_STATUS_CODE_MAP[num];
      }
    }

    return null;
  }

  /**
   * Checks whether targetStatus is a permissible forward status progression.
   * Strictly prevents moving backward in the lifecycle.
   */
  canAdvanceStatus(
    currentStatus: OrderStatusEnum,
    targetStatus: OrderStatusEnum,
  ): boolean {
    if (currentStatus === targetStatus) {
      return false; // Idempotent: no update needed
    }

    // Cancelled is a terminal state
    if (currentStatus === OrderStatusEnum.CANCELLED) {
      return false;
    }

    // Returned is a terminal state for returns
    if (currentStatus === OrderStatusEnum.RETURNED) {
      return false;
    }

    // Delivered cannot revert to Shipped, Out For Delivery, Packed, Placed
    if (currentStatus === OrderStatusEnum.DELIVERED) {
      return (
        targetStatus === OrderStatusEnum.RETURN_INITIATED ||
        targetStatus === OrderStatusEnum.RETURNED
      );
    }

    // Out For Delivery cannot revert to Shipped, Packed, Placed
    if (currentStatus === OrderStatusEnum.OUT_FOR_DELIVERY) {
      return (
        targetStatus === OrderStatusEnum.DELIVERED ||
        targetStatus === OrderStatusEnum.RETURN_INITIATED ||
        targetStatus === OrderStatusEnum.RETURNED ||
        targetStatus === OrderStatusEnum.CANCELLED
      );
    }

    // Shipped cannot revert to Packed, Placed, Processing, Pending
    if (currentStatus === OrderStatusEnum.SHIPPED) {
      return (
        targetStatus === OrderStatusEnum.OUT_FOR_DELIVERY ||
        targetStatus === OrderStatusEnum.DELIVERED ||
        targetStatus === OrderStatusEnum.RETURN_INITIATED ||
        targetStatus === OrderStatusEnum.RETURNED ||
        targetStatus === OrderStatusEnum.CANCELLED
      );
    }

    // Generic rank check for initial stages (Pending, Placed, Processing, Packed)
    const currentRank = STATUS_PROGRESSION_RANK[currentStatus] || 0;
    const targetRank = STATUS_PROGRESSION_RANK[targetStatus] || 0;

    return targetRank > currentRank;
  }

  /**
   * Extracts and unwraps standard fields from Shiprocket webhook payload.
   */
  private extractPayloadFields(body: any): {
    shipmentId: string | null;
    orderId: string | null;
    awb: string | null;
    courierName: string | null;
    rawStatus: string | null;
    statusCode: number | string | null;
    etd: string | null;
    scans: any[];
    eventId: string | null;
    timestamp: string | null;
  } {
    if (!body || typeof body !== "object") {
      return {
        shipmentId: null,
        orderId: null,
        awb: null,
        courierName: null,
        rawStatus: null,
        statusCode: null,
        etd: null,
        scans: [],
        eventId: null,
        timestamp: null,
      };
    }

    const data = body.data || body.response || body;

    const shipmentId =
      data.shipment_id != null
        ? String(data.shipment_id).trim()
        : data.sr_shipment_id != null
          ? String(data.sr_shipment_id).trim()
          : data.shipmentId != null
            ? String(data.shipmentId).trim()
            : null;

    const orderId =
      data.order_id != null
        ? String(data.order_id).trim()
        : data.sr_order_id != null
          ? String(data.sr_order_id).trim()
          : data.channel_order_id != null
            ? String(data.channel_order_id).trim()
            : data.orderId != null
              ? String(data.orderId).trim()
              : null;

    const awb =
      data.awb != null
        ? String(data.awb).trim()
        : data.awb_code != null
          ? String(data.awb_code).trim()
          : data.tracking_number != null
            ? String(data.tracking_number).trim()
            : data.awbCode != null
              ? String(data.awbCode).trim()
              : null;

    const courierName =
      data.courier_name != null
        ? String(data.courier_name).trim()
        : data.courier_partner != null
          ? String(data.courier_partner).trim()
          : data.courierName != null
            ? String(data.courierName).trim()
            : data.courier != null
              ? String(data.courier).trim()
              : null;

    const rawStatus =
      data.current_status != null
        ? String(data.current_status).trim()
        : data.shipment_status != null
          ? String(data.shipment_status).trim()
          : data.status != null
            ? String(data.status).trim()
            : null;

    const statusCode =
      data.status_code ??
      data.current_status_id ??
      data.shipment_status_id ??
      data.statusCode ??
      null;

    const etd =
      data.etd != null
        ? String(data.etd).trim()
        : data.edd != null
          ? String(data.edd).trim()
          : data.estimated_delivery_date != null
            ? String(data.estimated_delivery_date).trim()
            : null;

    const scans = Array.isArray(data.scans)
      ? data.scans
      : Array.isArray(body.scans)
        ? body.scans
        : [];

    const eventId =
      body.event_id != null
        ? String(body.event_id).trim()
        : body.id != null
          ? String(body.id).trim()
          : data.event_id != null
            ? String(data.event_id).trim()
            : null;

    const timestamp =
      data.current_timestamp != null
        ? String(data.current_timestamp).trim()
        : scans.length > 0 && scans[0]?.date
          ? String(scans[0].date).trim()
          : null;

    return {
      shipmentId: shipmentId || null,
      orderId: orderId || null,
      awb: awb || null,
      courierName: courierName || null,
      rawStatus: rawStatus || null,
      statusCode,
      etd: etd || null,
      scans,
      eventId: eventId || null,
      timestamp: timestamp || null,
    };
  }

  /**
   * Matches the incoming webhook to an existing KickAt Order using strongest available identifiers.
   * Priority:
   * 1. shiprocketShipmentId
   * 2. shiprocketOrderId
   * 3. trackingNumber (AWB)
   * 4. orderNumber
   * 5. id (UUID)
   */
  async findMatchingOrder(identifiers: {
    shipmentId: string | null;
    orderId: string | null;
    awb: string | null;
  }) {
    const { shipmentId, orderId, awb } = identifiers;

    // 1. Match by Shiprocket Shipment ID
    if (shipmentId) {
      const order = await this.prisma.order.findFirst({
        where: { shiprocketShipmentId: shipmentId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "shiprocketShipmentId" };
    }

    // 2. Match by Shiprocket Order ID
    if (orderId) {
      const order = await this.prisma.order.findFirst({
        where: { shiprocketOrderId: orderId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "shiprocketOrderId" };
    }

    // 3. Match by AWB / Tracking Number
    if (awb) {
      const order = await this.prisma.order.findFirst({
        where: { trackingNumber: awb },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "trackingNumber" };
    }

    // 4. Match by KickAt Order Number (in case order_id was passed as orderNumber)
    if (orderId) {
      const order = await this.prisma.order.findFirst({
        where: { orderNumber: orderId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "orderNumber" };
    }

    // 5. Match by Order UUID (if orderId is valid UUID)
    if (orderId && UUID_V4_REGEX.test(orderId)) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });
      if (order) return { order, matchedBy: "id" };
    }

    return { order: null, matchedBy: null };
  }

  /**
   * Main webhook processor entry point.
   * Enforces authentication, validation, deduplication, order matching,
   * progression safety, atomic persistence, and notifications.
   */
  async processWebhook(options: ProcessWebhookOptions): Promise<ProcessWebhookResult> {
    const { headers, body } = options;

    this.logger.log("Shiprocket webhook received.");

    // 1. Authenticate webhook request
    this.verifyAuthentication(headers);

    // 2. Validate payload structure safely (do not throw if empty / probe)
    const payloadObject = body && typeof body === "object" ? body : {};

    const fields = this.extractPayloadFields(payloadObject);
    const {
      shipmentId,
      orderId,
      awb,
      courierName,
      rawStatus,
      statusCode,
      etd,
      eventId: payloadEventId,
      timestamp,
    } = fields;

    // 3. If no identifiers are present (e.g. Test Webhook ping / header verification from Shiprocket dashboard)
    if (!shipmentId && !orderId && !awb) {
      this.logger.log(
        "Shiprocket webhook test ping or configuration validation acknowledged.",
      );
      return {
        success: true,
        message: "Shiprocket webhook test ping acknowledged successfully",
        matched: false,
        test: true,
      };
    }

    // 4. Match KickAt Order
    const { order, matchedBy } = await this.findMatchingOrder({
      shipmentId,
      orderId,
      awb,
    });

    if (!order) {
      this.logger.warn(
        `Shiprocket webhook unmatched: No order found (shipment_id=${shipmentId}, order_id=${orderId}, awb=${awb}).`,
      );

      // Record unmatched webhook in WebhookLog for auditability
      const unmatchedEventId =
        this.extractHeaderValue(headers, ["x-shiprocket-event-id", "x-event-id", "x-webhook-id"]) ||
        payloadEventId ||
        `sr_unmatched_${shipmentId || orderId || awb}_${rawStatus || statusCode || "status"}_${timestamp || Date.now()}`;

      try {
        await this.prisma.webhookLog.create({
          data: {
            eventId: unmatchedEventId,
            event: `SHIPROCKET_${rawStatus || statusCode || "UNMATCHED"}`,
            payload: JSON.parse(JSON.stringify(payloadObject || {})),
            status: "UNMATCHED",
            processedAt: new Date(),
          },
        });
      } catch (err: any) {
        // Ignore duplicate log error on unmatched events
      }

      return {
        success: true,
        message: "Shiprocket webhook received but no matching KickAt order found.",
        matched: false,
      };
    }

    this.logger.log(
      `Shiprocket webhook matched order ${order.orderNumber} (id=${order.id}) via ${matchedBy}.`,
    );

    // 4b. Persist the courier scan events carried by this webhook. Event rows
    // are deduplicated on (orderId, rawStatus, eventAt), so this runs on every
    // delivery (including re-deliveries) and is best-effort: a failure here
    // must never block the status update below; the tracking sync cron
    // re-pulls anything missed.
    if (this.trackingEventsService) {
      try {
        await this.trackingEventsService.recordEvents(
          order.id,
          extractShiprocketWebhookEvents(payloadObject),
          {
            source: "WEBHOOK",
            awb: awb || order.trackingNumber,
            shipmentId: shipmentId || order.shiprocketShipmentId,
          },
        );
      } catch (trackErr: any) {
        this.logger.warn(
          `Failed to persist tracking events for order ${order.orderNumber}: ${trackErr?.message || trackErr}`,
        );
      }
    }

    // 5. Idempotency Check: Determine unique event ID
    const eventId =
      this.extractHeaderValue(headers, ["x-shiprocket-event-id", "x-event-id", "x-webhook-id"]) ||
      payloadEventId ||
      `sr_${order.id}_${shipmentId || order.shiprocketShipmentId || "noship"}_${rawStatus || statusCode || "status"}_${timestamp || ""}`;

    const existingLog = await this.prisma.webhookLog.findUnique({
      where: { eventId },
    });

    if (existingLog) {
      this.logger.log(
        `Duplicate Shiprocket webhook event ignored (eventId=${eventId}, order=${order.orderNumber}).`,
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
    const normalizedStatus = this.normalizeStatus(rawStatus, statusCode);

    if (rawStatus && !normalizedStatus) {
      this.logger.warn(
        `Unknown Shiprocket status received: "${rawStatus}" (statusCode: ${statusCode}) for order ${order.orderNumber}.`,
      );
    }

    // 7. Check status progression safety
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

    // 8. Build update payload (preserving good existing non-null fields)
    const updateData: Prisma.OrderUpdateInput = {};

    if (awb && awb.trim()) {
      updateData.trackingNumber = awb.trim();
    }
    if (courierName && courierName.trim()) {
      updateData.courierPartner = courierName.trim();
    }
    if (shipmentId && shipmentId.trim() && !order.shiprocketShipmentId) {
      updateData.shiprocketShipmentId = shipmentId.trim();
    }
    if (orderId && orderId.trim() && !order.shiprocketOrderId) {
      updateData.shiprocketOrderId = orderId.trim();
    }
    if (!order.shippingProvider) {
      updateData.shippingProvider = "SHIPROCKET";
    }
    if (etd && etd.trim()) {
      const parsedEtd = new Date(etd.trim());
      if (!isNaN(parsedEtd.getTime())) {
        updateData.estimatedDelivery = parsedEtd;
      }
    }
    if (shouldAdvanceStatus && normalizedStatus) {
      updateData.orderStatus = normalizedStatus;
    }

    // 9. Execute database update and WebhookLog creation within transaction
    let updatedOrder = order;
    try {
      updatedOrder = await this.prisma.$transaction(async (tx) => {
        // Record WebhookLog entry
        await tx.webhookLog.create({
          data: {
            eventId,
            event: `SHIPROCKET_${rawStatus || statusCode || "UPDATE"}`,
            payload: JSON.parse(JSON.stringify(payloadObject || {})),
            status: "SUCCESS",
            processedAt: new Date(),
          },
        });

        // Update Order if there are changes
        if (Object.keys(updateData).length > 0) {
          return tx.order.update({
            where: { id: order.id },
            data: updateData,
            include: {
              user: { select: { id: true, name: true, email: true, phone: true } },
              address: true,
            },
          });
        }

        return order;
      });
    } catch (err: any) {
      // Handle parallel duplicate delivery race condition gracefully
      if (err?.code === "P2002") {
        this.logger.log(
          `Concurrent duplicate Shiprocket webhook event caught for eventId=${eventId}.`,
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
        `Shiprocket webhook transaction failed for order ${order.orderNumber}: ${err.message}`,
        err.stack,
      );
      throw err;
    }

    // 10. Send customer notifications if status actually transitioned
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
          courierPartner: updatedOrder.courierPartner,
          estimatedDelivery: updatedOrder.estimatedDelivery,
        });
      } catch (notifyErr: any) {
        this.logger.warn(
          `Failed to dispatch notification for order ${order.orderNumber}: ${notifyErr.message}`,
        );
      }
    }

    return {
      success: true,
      message: "Shiprocket webhook processed successfully",
      matched: true,
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      oldStatus: order.orderStatus,
      newStatus: updatedOrder.orderStatus,
      statusUpdated: shouldAdvanceStatus,
      trackingNumber: updatedOrder.trackingNumber,
      courierPartner: updatedOrder.courierPartner,
    };
  }
}
