import { OrderStatusEnum, PaymentMethodEnum } from '@prisma/client';

/**
 * Pure helpers for real courier tracking events.
 *
 * Everything here works only with what the provider actually reported: no
 * hub names, locations or timestamps are ever invented. Shared by the
 * Shiprocket webhook, the on-demand/cron AWB sync, and the customer + admin
 * tracking APIs.
 */

export type TrackingStage =
  | 'ORDER_PLACED'
  | 'PACKED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RTO_INITIATED'
  | 'RTO_DELIVERED'
  | 'UPDATE';

export const TRACKING_STAGE_TITLES: Record<TrackingStage, string> = {
  ORDER_PLACED: 'Order Placed',
  PACKED: 'Packed & Ready to Ship',
  SHIPPED: 'Picked Up by Courier',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Shipment Cancelled',
  RTO_INITIATED: 'Return to Origin Initiated',
  RTO_DELIVERED: 'Returned to Origin',
  UPDATE: 'Shipment Update',
};

export type TrackingEventSource = 'WEBHOOK' | 'POLL';

export interface ParsedTrackingEvent {
  rawStatus: string;
  stage: TrackingStage;
  description: string | null;
  location: string | null;
  /** null only when the provider gave no usable timestamp. */
  eventAt: Date | null;
}

/** Shape of a persisted OrderTrackingEvent row as consumed by the builders. */
export interface StoredTrackingEvent {
  rawStatus: string;
  stage: string;
  description: string | null;
  location: string | null;
  eventAt: Date;
  source: string;
}

const EXACT_STAGE_MAP: Record<string, TrackingStage> = {
  'AWB ASSIGNED': 'PACKED',
  'LABEL GENERATED': 'PACKED',
  'MANIFEST GENERATED': 'PACKED',
  'READY TO SHIP': 'PACKED',
  'PICKUP SCHEDULED': 'PACKED',
  'PICKUP GENERATED': 'PACKED',
  'PICKUP QUEUED': 'PACKED',
  'PICKUP RESCHEDULED': 'PACKED',
  'OUT FOR PICKUP': 'PACKED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  'PICKED UP': 'SHIPPED',
  'PICKUP DONE': 'SHIPPED',
  'HANDOVER TO COURIER': 'SHIPPED',
  DISPATCHED: 'SHIPPED',
  'IN TRANSIT': 'IN_TRANSIT',
  'IN FLIGHT': 'IN_TRANSIT',
  'REACHED AT HUB': 'IN_TRANSIT',
  'REACHED HUB': 'IN_TRANSIT',
  'REACHED AT DESTINATION': 'IN_TRANSIT',
  'REACHED AT DESTINATION HUB': 'IN_TRANSIT',
  'REACHED DESTINATION HUB': 'IN_TRANSIT',
  'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  'RTO INITIATED': 'RTO_INITIATED',
  'RTO IN TRANSIT': 'RTO_INITIATED',
  'RTO OUT FOR DELIVERY': 'RTO_INITIATED',
  'RTO ACKNOWLEDGED': 'RTO_INITIATED',
  'RTO DELIVERED': 'RTO_DELIVERED',
  RETURNED: 'RTO_DELIVERED',
};

/**
 * Only the Shiprocket numeric codes we are confident about. Anything else
 * falls back to the textual status, then to the neutral UPDATE stage.
 */
const STAGE_CODE_MAP: Record<number, TrackingStage> = {
  6: 'SHIPPED',
  7: 'DELIVERED',
  8: 'CANCELLED',
  9: 'RTO_INITIATED',
  10: 'RTO_DELIVERED',
  17: 'OUT_FOR_DELIVERY',
  18: 'IN_TRANSIT',
  42: 'SHIPPED',
};

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toUpperCase() === 'NA' || text.toUpperCase() === 'N/A') {
    return null;
  }
  return text;
}

export function mapProviderStatusToStage(
  rawStatus?: string | null,
  statusCode?: number | string | null,
): TrackingStage | null {
  const text = cleanText(rawStatus);
  if (text) {
    const key = text.toUpperCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if (EXACT_STAGE_MAP[key]) return EXACT_STAGE_MAP[key];
  }

  if (statusCode !== null && statusCode !== undefined && statusCode !== '') {
    const num =
      typeof statusCode === 'number'
        ? statusCode
        : parseInt(String(statusCode), 10);
    if (!isNaN(num) && STAGE_CODE_MAP[num]) return STAGE_CODE_MAP[num];
  }

  return null;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istToDate(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second?: string,
): Date | null {
  const ms =
    Date.UTC(+year, +month - 1, +day, +hour, +minute, second ? +second : 0) -
    IST_OFFSET_MS;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parses Shiprocket timestamps. Zone-less values are IST (Shiprocket's
 * convention):
 *   - scans / track API: "2023-05-19 11:59:16"
 *   - webhook current_timestamp: "23 05 2023 11:43:52"
 * Values carrying an explicit zone (ISO-8601) are parsed as-is.
 */
export function parseProviderTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    text,
  );
  if (m) return istToDate(m[1], m[2], m[3], m[4], m[5], m[6]);

  m =
    /^(\d{2})[ \-/](\d{2})[ \-/](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      text,
    );
  if (m) return istToDate(m[3], m[2], m[1], m[4], m[5], m[6]);

  // Only trust free-form parsing when the string carries an explicit zone.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Parses one Shiprocket scan / tracking activity:
 *   { date, status, activity, location, "sr-status", "sr-status-label" }
 * Returns null when the scan has no usable status or no timestamp (a scan we
 * cannot place in time is not shown rather than guessed).
 */
export function parseShiprocketScan(scan: any): ParsedTrackingEvent | null {
  if (!scan || typeof scan !== 'object') return null;

  const label = cleanText(scan['sr-status-label'] ?? scan.sr_status_label);
  const srCode = scan['sr-status'] ?? scan.sr_status ?? null;
  const courierStatus = cleanText(scan.status);
  const activity = cleanText(scan.activity ?? scan.message ?? scan.remarks);
  const location = cleanText(scan.location);
  const eventAt = parseProviderTimestamp(
    scan.date ?? scan.timestamp ?? scan.updated_time_stamp ?? null,
  );

  const rawStatus = label || courierStatus || activity;
  if (!rawStatus || !eventAt) return null;

  const stage =
    mapProviderStatusToStage(label, srCode) ??
    mapProviderStatusToStage(activity) ??
    mapProviderStatusToStage(courierStatus) ??
    'UPDATE';

  return {
    rawStatus,
    stage,
    description: activity,
    location,
    eventAt,
  };
}

/**
 * Extracts every tracking event carried by a Shiprocket webhook payload: each
 * scan, plus the current status itself when no scan already represents it.
 */
export function extractShiprocketWebhookEvents(
  body: any,
): ParsedTrackingEvent[] {
  if (!body || typeof body !== 'object') return [];
  const data = body.data || body.response || body;

  const rawScans = Array.isArray(data.scans)
    ? data.scans
    : Array.isArray(body.scans)
      ? body.scans
      : [];

  const events = rawScans
    .map((scan: any) => parseShiprocketScan(scan))
    .filter((e: ParsedTrackingEvent | null): e is ParsedTrackingEvent => !!e);

  const currentStatus = cleanText(
    data.current_status ?? data.shipment_status ?? data.status,
  );
  if (currentStatus) {
    const statusCode =
      data.current_status_id ??
      data.shipment_status_id ??
      data.status_code ??
      null;
    const stage =
      mapProviderStatusToStage(currentStatus, statusCode) ?? 'UPDATE';
    const alreadyCovered = events.some(
      (e) =>
        (stage !== 'UPDATE' && e.stage === stage) ||
        e.rawStatus.toUpperCase() === currentStatus.toUpperCase(),
    );
    if (!alreadyCovered) {
      events.push({
        rawStatus: currentStatus,
        stage,
        description: null,
        location: null,
        eventAt: parseProviderTimestamp(data.current_timestamp ?? null),
      });
    }
  }

  return events;
}

/**
 * Maps a stage to the KickAt order status it proves the parcel has reached.
 * Only forward-delivery stages are mapped; cancellation and RTO are left to
 * the webhook flow, which owns those side effects.
 */
export function stageToForwardOrderStatus(
  stage: string,
): OrderStatusEnum | null {
  switch (stage) {
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return OrderStatusEnum.SHIPPED;
    case 'OUT_FOR_DELIVERY':
      return OrderStatusEnum.OUT_FOR_DELIVERY;
    case 'DELIVERED':
      return OrderStatusEnum.DELIVERED;
    default:
      return null;
  }
}

export interface TrackingTimelineStep {
  stage: string;
  title: string;
  location: string | null;
  timestamp: Date | null;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string | null;
  rawStatus?: string;
  source?: string;
}

export interface TrackingOrderInput {
  orderStatus: OrderStatusEnum;
  paymentMethod?: PaymentMethodEnum | string | null;
  createdAt: Date;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  deliveryDate?: Date | null;
  courierPartner?: string | null;
  trackingNumber?: string | null;
}

function eventToStep(
  event: StoredTrackingEvent,
  isCurrent: boolean,
): TrackingTimelineStep {
  const stage =
    (event.stage as TrackingStage) in TRACKING_STAGE_TITLES
      ? (event.stage as TrackingStage)
      : 'UPDATE';
  return {
    stage,
    title: TRACKING_STAGE_TITLES[stage],
    location: event.location || null,
    timestamp: event.eventAt,
    isCompleted: true,
    isCurrent,
    description: event.description || null,
    rawStatus: event.rawStatus,
    source: event.source,
  };
}

/** Public, chronological representation of persisted events. */
export function serializeTrackingEvents(events: StoredTrackingEvent[]) {
  return [...events]
    .sort(
      (a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
    )
    .map((event) => {
      const step = eventToStep(event, false);
      return {
        stage: step.stage,
        title: step.title,
        rawStatus: event.rawStatus,
        description: step.description,
        location: step.location,
        timestamp: event.eventAt,
        source: event.source,
      };
    });
}

/**
 * Builds the tracking timeline.
 *
 * - With real provider events: "Order Placed" followed by the events in
 *   chronological order; the latest one is current.
 * - Without events: a status-derived milestone summary (fallback for the
 *   existing contract) with no invented locations and no invented timestamps.
 * - Cancelled orders always end at CANCELLED, with no delivery stages after it.
 */
export function buildTrackingTimeline(
  order: TrackingOrderInput,
  events: StoredTrackingEvent[],
): TrackingTimelineStep[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
  );

  const isCod = String(order.paymentMethod || '').toUpperCase() === 'COD';
  const placed: TrackingTimelineStep = {
    stage: 'ORDER_PLACED',
    title: 'Order Placed & Confirmed',
    location: null,
    timestamp: order.createdAt,
    isCompleted: true,
    isCurrent: false,
    description: isCod
      ? 'Order placed with Cash on Delivery.'
      : 'Order placed and payment verified.',
  };

  if (order.orderStatus === OrderStatusEnum.CANCELLED) {
    const cancelledAt = order.cancelledAt
      ? new Date(order.cancelledAt).getTime()
      : null;
    const excluded = new Set([
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'RTO_DELIVERED',
    ]);
    const before = sorted.filter(
      (e) =>
        !excluded.has(e.stage) &&
        (cancelledAt === null || new Date(e.eventAt).getTime() <= cancelledAt),
    );
    return [
      placed,
      ...before.map((e) => eventToStep(e, false)),
      {
        stage: 'CANCELLED',
        title: 'Order Cancelled',
        location: null,
        timestamp: order.cancelledAt || null,
        isCompleted: true,
        isCurrent: true,
        description: order.cancelReason
          ? `Reason: ${order.cancelReason}`
          : 'Order was cancelled.',
      },
    ];
  }

  if (sorted.length > 0) {
    return [
      placed,
      ...sorted.map((e, idx) => eventToStep(e, idx === sorted.length - 1)),
    ];
  }

  // ---- Fallback summary: no provider events yet -------------------------
  const isRTO =
    order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
    order.orderStatus === OrderStatusEnum.RETURNED;
  const statusOrder: OrderStatusEnum[] = [
    OrderStatusEnum.PLACED,
    OrderStatusEnum.PROCESSING,
    OrderStatusEnum.PACKED,
    OrderStatusEnum.SHIPPED,
    OrderStatusEnum.OUT_FOR_DELIVERY,
    OrderStatusEnum.DELIVERED,
  ];
  const idx = statusOrder.indexOf(order.orderStatus);
  const isFinal =
    order.orderStatus === OrderStatusEnum.DELIVERED ||
    order.orderStatus === OrderStatusEnum.RETURNED;
  const courier = order.courierPartner || null;
  const awb = order.trackingNumber || null;

  placed.isCurrent = idx <= 0 && !isRTO;

  return [
    placed,
    {
      stage: 'PACKED',
      title: 'Packed at Warehouse',
      location: null,
      timestamp: null,
      isCompleted: idx >= 2 || isRTO,
      isCurrent: idx === 1 || idx === 2,
      description: 'Items packed and ready to ship.',
    },
    {
      stage: 'SHIPPED',
      title: 'Handed Over to Courier',
      location: null,
      timestamp: null,
      isCompleted: idx >= 3 || isRTO,
      isCurrent: idx === 3,
      description:
        courier && awb
          ? `Handed over to ${courier} under AWB ${awb}.`
          : 'Handed over to the courier.',
    },
    {
      stage: 'IN_TRANSIT',
      title: 'In Transit',
      location: null,
      timestamp: null,
      isCompleted: idx >= 4 || isRTO,
      isCurrent: false,
      description: 'On the way with the courier.',
    },
    {
      stage: 'OUT_FOR_DELIVERY',
      title: 'Out for Delivery',
      location: null,
      timestamp: null,
      isCompleted: idx >= 4,
      isCurrent: idx === 4,
      description: 'Out for delivery.',
    },
    {
      stage: isRTO ? 'RTO_INITIATED' : 'DELIVERED',
      title: isRTO ? 'Return to Origin (RTO)' : 'Delivered to Recipient',
      location: null,
      timestamp: isFinal ? order.deliveryDate || null : null,
      isCompleted: isFinal,
      isCurrent:
        isFinal || order.orderStatus === OrderStatusEnum.RETURN_INITIATED,
      description: isRTO
        ? 'Shipment marked for Return to Origin.'
        : 'Package delivered.',
    },
  ];
}

/** Truthful empty-state copy when the provider has not reported any scan yet. */
export function getTrackingPlaceholderMessage(
  order: TrackingOrderInput,
  events: StoredTrackingEvent[],
): string | null {
  if (events.length > 0) return null;
  if (
    order.orderStatus === OrderStatusEnum.CANCELLED ||
    order.orderStatus === OrderStatusEnum.DELIVERED ||
    order.orderStatus === OrderStatusEnum.RETURNED
  ) {
    return null;
  }
  return 'Tracking will appear once the shipment is picked up.';
}

/** Latest provider-reported location, if any. */
export function getLatestEventLocation(
  events: StoredTrackingEvent[],
): string | null {
  const sorted = [...events].sort(
    (a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
  );
  return sorted.find((e) => !!e.location)?.location ?? null;
}
