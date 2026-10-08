import { StockAlertService } from '../notifications/stock-alert.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../admin/settings/settings.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetOrdersQueryDto,
  OrderStatusQueryEnum,
  OrderTypeQueryEnum,
} from './dto/get-orders-query.dto';
import { GetReturnsQueryDto } from './dto/get-returns-query.dto';
import {
  CancelOrderDto,
  CancelReasonEnum,
  CANCEL_REASON_LABELS,
} from './dto/cancel-order.dto';
import { ReturnOrderDto } from './dto/return-order.dto';
import { ReorderDto, ReorderItemDto } from './dto/reorder.dto';
import { OrderAgainQueryDto } from './dto/order-again-query.dto';
import { OrderStatusEnum, PaymentStatusEnum } from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { ShippingService } from '../admin/shipping/shipping.service';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Order lifecycle (enforced server-side):
 *
 *   PENDING (unpaid) -> PLACED (paid/COD) -> PROCESSING
 *     -> PACKED -> SHIPPED (AWB assigned) -> OUT_FOR_DELIVERY -> DELIVERED
 *   Terminal: CANCELLED, RETURN_INITIATED, RETURNED
 *
 * Cancellation is a PRE-SHIPMENT action only. These are the only states from
 * which a customer may cancel, and additionally the order must not yet carry a
 * courier AWB / provider shipment id.
 */
const CANCELLABLE_STATUSES: OrderStatusEnum[] = [
  OrderStatusEnum.PENDING,
  OrderStatusEnum.PLACED,
  OrderStatusEnum.PROCESSING,
];

/**
 * Preset reasons surfaced to the client so the cancellation dropdown is driven
 * by the backend instead of being hardcoded in the frontend.
 */
const CANCELLATION_REASON_OPTIONS = [
  CancelReasonEnum.ORDERED_BY_MISTAKE,
  CancelReasonEnum.FOUND_CHEAPER,
  CancelReasonEnum.DELIVERY_TOO_SLOW,
  CancelReasonEnum.CHANGE_ITEMS,
  CancelReasonEnum.OTHER,
].map((code) => ({
  code,
  label: CANCEL_REASON_LABELS[code],
  requiresNote: code === CancelReasonEnum.OTHER,
}));

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly stockAlertService: StockAlertService,
    private readonly invoicePdfService: InvoicePdfService,
    @Optional() private readonly paymentsService?: PaymentsService,
    @Optional() private readonly shippingService?: ShippingService,
  ) {}

  /**
   * SINGLE SOURCE OF TRUTH for whether an order may be cancelled.
   *
   * Returns true only when ALL of the following hold:
   *  - orderStatus is PENDING | PLACED | PROCESSING (pre-shipment)
   *  - no courier AWB has been assigned (trackingNumber empty)
   *  - no provider shipment exists (shiprocketShipmentId empty)
   *
   * Used both to gate the cancel endpoint and to compute the `cancellable`
   * flag the order detail page reads to show/hide the Cancel Order button.
   */
  isCancellable(order: {
    orderStatus: OrderStatusEnum;
    trackingNumber?: string | null;
    shiprocketShipmentId?: string | null;
  }): boolean {
    if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      return false;
    }
    if (order.trackingNumber && order.trackingNumber.trim().length > 0) {
      return false;
    }
    if (
      order.shiprocketShipmentId &&
      order.shiprocketShipmentId.trim().length > 0
    ) {
      return false;
    }
    return true;
  }

  /**
   * Explains, in customer-facing language, why an order cannot be cancelled.
   * Returned alongside `cancellable: false` so the UI can show a reason.
   */
  private getCancellationBlockedReason(order: {
    orderStatus: OrderStatusEnum;
    trackingNumber?: string | null;
    shiprocketShipmentId?: string | null;
  }): string | null {
    if (this.isCancellable(order)) return null;

    if (order.orderStatus === OrderStatusEnum.CANCELLED) {
      return 'This order has already been cancelled.';
    }
    if (
      order.orderStatus === OrderStatusEnum.RETURNED ||
      order.orderStatus === OrderStatusEnum.RETURN_INITIATED
    ) {
      return 'This order is in the returns process and cannot be cancelled.';
    }
    if (order.orderStatus === OrderStatusEnum.DELIVERED) {
      return 'This order has been delivered. You can request a return instead.';
    }
    if (
      order.orderStatus === OrderStatusEnum.SHIPPED ||
      order.orderStatus === OrderStatusEnum.OUT_FOR_DELIVERY
    ) {
      return 'This order is already on its way and can no longer be cancelled.';
    }
    if (order.orderStatus === OrderStatusEnum.PACKED) {
      return 'This order is already packed for dispatch and can no longer be cancelled.';
    }
    // Pre-shipment status but an AWB/shipment already exists.
    return 'This order has already been handed to the courier and can no longer be cancelled. Please contact support for assistance.';
  }

  /**
   * Attaches the computed cancellation fields to an order object.
   * Purely additive — no existing field is modified or removed.
   */
  private withCancellationMeta<
    T extends {
      orderStatus: OrderStatusEnum;
      trackingNumber?: string | null;
      shiprocketShipmentId?: string | null;
    },
  >(
    order: T,
  ): T & { cancellable: boolean; cancellationBlockedReason: string | null } {
    return {
      ...order,
      cancellable: this.isCancellable(order),
      cancellationBlockedReason: this.getCancellationBlockedReason(order),
    };
  }

  private validateUuid(id: string, paramName: string = 'id'): string {
    if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(`${paramName} must be a valid UUID v4`);
    }
    return id;
  }

  private async enrichItemsWithProductData(items: any[]): Promise<any[]> {
    if (!items || items.length === 0) return items;

    const productIds = Array.from(
      new Set(items.map((i) => i.productId).filter(Boolean)),
    );
    const variantIds = Array.from(
      new Set(items.map((i) => i.variantId).filter(Boolean)),
    ) as string[];

    const products: any[] =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              slug: true,
              imageUrl: true,
              images: true,
              name: true,
              brand: true,
              petSpecies: true,
            },
          })
        : [];

    const variants: any[] =
      variantIds.length > 0
        ? await this.prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, imageUrl: true, images: true, name: true },
          })
        : [];

    const productMap = new Map<string, any>();
    for (const p of products) {
      productMap.set(p.id, p);
    }

    const variantMap = new Map<string, any>();
    for (const v of variants) {
      variantMap.set(v.id, v);
    }

    return items.map((item) => {
      const prod = productMap.get(item.productId);
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      const imageUrl =
        variant?.imageUrl ||
        (Array.isArray(variant?.images) && variant.images.length > 0
          ? variant.images[0]
          : null) ||
        prod?.imageUrl ||
        (Array.isArray(prod?.images) && prod.images.length > 0
          ? prod.images[0]
          : null) ||
        null;
      const productSlug = prod?.slug || null;
      const brand = prod?.brand || 'KickAt Official';

      return {
        ...item,
        imageUrl,
        image: imageUrl,
        productSlug,
        brand,
      };
    });
  }

  /**
   * Issue 2: an online order created for a Razorpay attempt that was never
   * completed sits at orderStatus PENDING and must be invisible to the
   * customer. `allowActivePaymentAttempt` lets the order-detail endpoint
   * surface it while the payment retry window (30 min) is still open, so the
   * retry screen keeps working; every other customer-facing order endpoint
   * (timeline, tracking, invoice, cancel, return, reorder) treats it as
   * non-existent.
   */
  private static readonly PENDING_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

  private async isWithinActivePaymentAttempt(order: {
    id: string;
    createdAt: Date;
  }): Promise<boolean> {
    const age = Date.now() - new Date(order.createdAt).getTime();
    if (age > OrdersService.PENDING_PAYMENT_WINDOW_MS) {
      return false;
    }

    const attempts = await this.prisma.payment.count({
      where: { orderId: order.id },
    });

    return attempts > 0;
  }

  private async findOrderAndVerifyOwnership(
    userId: string,
    orderId: string,
    options?: { allowActivePaymentAttempt?: boolean },
  ) {
    this.validateUuid(orderId, 'id');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: true,
        address: true,
        payments: true,
        returns: {
          include: { items: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('Not your order');
    }

    // Unpaid, hidden order: 404 unless the caller explicitly allows an
    // in-flight payment attempt (order detail / payment retry screen).
    if (order.orderStatus === OrderStatusEnum.PENDING) {
      const allowed =
        options?.allowActivePaymentAttempt === true &&
        (await this.isWithinActivePaymentAttempt(order));

      if (!allowed) {
        throw new NotFoundException('Order not found');
      }
    }

    if (order.items && order.items.length > 0) {
      order.items = await this.enrichItemsWithProductData(order.items);
    }

    return order;
  }

  private mapQueryStatusToEnum(status: OrderStatusQueryEnum): OrderStatusEnum {
    switch (status) {
      case OrderStatusQueryEnum.PENDING:
        return OrderStatusEnum.PENDING;
      case OrderStatusQueryEnum.PROCESSING:
        return OrderStatusEnum.PROCESSING;
      case OrderStatusQueryEnum.PACKED:
        return OrderStatusEnum.PACKED;
      case OrderStatusQueryEnum.SHIPPED:
        return OrderStatusEnum.SHIPPED;
      case OrderStatusQueryEnum.OUT_FOR_DELIVERY:
        return OrderStatusEnum.OUT_FOR_DELIVERY;
      case OrderStatusQueryEnum.DELIVERED:
        return OrderStatusEnum.DELIVERED;
      case OrderStatusQueryEnum.CANCELLED:
        return OrderStatusEnum.CANCELLED;
      case OrderStatusQueryEnum.RETURNED:
        return OrderStatusEnum.RETURNED;
      default:
        return OrderStatusEnum.PLACED;
    }
  }

  /**
   * GET /orders
   */
  async getOrders(userId: string, query: GetOrdersQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (query.status) {
      where.orderStatus = this.mapQueryStatusToEnum(query.status);
    }

    if (query.type) {
      if (query.type === OrderTypeQueryEnum.ONGOING) {
        // PENDING is deliberately absent: an unpaid online order is hidden.
        where.orderStatus = {
          in: [
            OrderStatusEnum.PLACED,
            OrderStatusEnum.PROCESSING,
            OrderStatusEnum.PACKED,
            OrderStatusEnum.SHIPPED,
            OrderStatusEnum.OUT_FOR_DELIVERY,
          ],
        };
      } else if (query.type === OrderTypeQueryEnum.PAST) {
        where.orderStatus = {
          in: [
            OrderStatusEnum.DELIVERED,
            OrderStatusEnum.CANCELLED,
            OrderStatusEnum.RETURNED,
          ],
        };
      }
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    // Issue 2: orders awaiting an online payment (orderStatus PENDING) are not
    // real orders yet and must never appear in order history - including when
    // the client explicitly asks for status=PENDING. ANDed with any filter
    // above, so it cannot be bypassed.
    where.NOT = { orderStatus: OrderStatusEnum.PENDING };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          address: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    // Enrich every order's items in ONE batched pass. Enriching per order
    // issued 2 extra queries per order (2 x page size round-trips); collecting
    // the items first keeps it at 2 queries for the whole page.
    const allItems = orders.flatMap((ord) => ord.items ?? []);
    const enrichedItems = await this.enrichItemsWithProductData(allItems);

    const enrichedItemsByOrderId = new Map<string, any[]>();
    for (const item of enrichedItems) {
      const bucket = enrichedItemsByOrderId.get(item.orderId);
      if (bucket) {
        bucket.push(item);
      } else {
        enrichedItemsByOrderId.set(item.orderId, [item]);
      }
    }

    const enrichedOrders = orders.map((ord) => {
      if (ord.items && ord.items.length > 0) {
        ord.items = enrichedItemsByOrderId.get(ord.id) ?? ord.items;
      }
      // Additive: tell the client whether this order can still be cancelled.
      return this.withCancellationMeta(ord);
    });

    return {
      success: true,
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /orders/:id
   */
  async getOrderById(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id, {
      allowActivePaymentAttempt: true,
    });

    // `cancellable` drives the Cancel Order button on the order detail page;
    // `cancellationReasons` drives the reason dropdown. Both are additive.
    return {
      success: true,
      order: this.withCancellationMeta(order),
      cancellationReasons: CANCELLATION_REASON_OPTIONS,
      // Additive: true only for an order still awaiting its online payment.
      // The payment retry screen uses it; order history never sees one.
      awaitingPayment: order.orderStatus === OrderStatusEnum.PENDING,
    };
  }

  /**
   * GET /orders/:id/refunds
   */
  async getOrderRefundHistory(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const audits = await this.prisma.refundAudit.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    const totalRefunded = audits
      .filter((a) => a.status === 'REFUNDED' || a.status === 'COD_REFUNDED')
      .reduce((sum, a) => sum + a.amount, 0);

    const pendingRefund = audits
      .filter((a) => a.status === 'REFUND_INITIATED')
      .reduce((sum, a) => sum + a.amount, 0);

    const failedRefund = audits
      .filter((a) => a.status === 'FAILED')
      .reduce((sum, a) => sum + a.amount, 0);

    return {
      success: true,
      summary: {
        totalRefundable: order.grandTotal,
        totalRefunded: Number(totalRefunded.toFixed(2)),
        pendingRefund: Number(pendingRefund.toFixed(2)),
        failedRefund: Number(failedRefund.toFixed(2)),
      },
      data: audits.map((a) => ({
        id: a.id,
        orderId: a.orderId,
        orderNumber: order.orderNumber,
        amount: a.amount,
        currency: a.currency,
        refundMethod: a.refundMethod,
        status: a.status,
        provider: a.provider,
        transactionReference: a.transactionReference,
        initiatedAt: a.initiatedAt,
        completedAt: a.completedAt,
        failedAt: a.failedAt,
        failureReason: a.failureReason,
      })),
    };
  }

  /**
   * GET /orders/:id/timeline
   */
  async getOrderTimeline(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    const steps = [
      {
        key: 'PLACED',
        title: 'Order Placed',
        description: 'Order details received',
        completed: true,
        timestamp: order.createdAt,
      },
      {
        key: 'PROCESSING',
        title: 'Processing',
        description: 'Order is being processed',
        completed: (
          [
            OrderStatusEnum.PROCESSING,
            OrderStatusEnum.PACKED,
            OrderStatusEnum.SHIPPED,
            OrderStatusEnum.OUT_FOR_DELIVERY,
            OrderStatusEnum.DELIVERED,
          ] as OrderStatusEnum[]
        ).includes(order.orderStatus),
        timestamp: order.createdAt,
      },
      {
        key: 'PACKED',
        title: 'Packed',
        description: 'Items packed securely',
        completed: (
          [
            OrderStatusEnum.PACKED,
            OrderStatusEnum.SHIPPED,
            OrderStatusEnum.OUT_FOR_DELIVERY,
            OrderStatusEnum.DELIVERED,
          ] as OrderStatusEnum[]
        ).includes(order.orderStatus),
        timestamp: null,
      },
      {
        key: 'SHIPPED',
        title: 'Shipped',
        description: 'Package handed over to courier',
        completed: (
          [
            OrderStatusEnum.SHIPPED,
            OrderStatusEnum.OUT_FOR_DELIVERY,
            OrderStatusEnum.DELIVERED,
          ] as OrderStatusEnum[]
        ).includes(order.orderStatus),
        timestamp: null,
      },
      {
        key: 'OUT_FOR_DELIVERY',
        title: 'Out for Delivery',
        description: 'Package on the way to delivery address',
        completed: (
          [
            OrderStatusEnum.OUT_FOR_DELIVERY,
            OrderStatusEnum.DELIVERED,
          ] as OrderStatusEnum[]
        ).includes(order.orderStatus),
        timestamp: null,
      },
      {
        key: 'DELIVERED',
        title: 'Delivered',
        description: 'Package delivered successfully',
        completed: order.orderStatus === OrderStatusEnum.DELIVERED,
        timestamp: order.deliveryDate,
      },
    ];

    if (order.orderStatus === OrderStatusEnum.CANCELLED) {
      steps.push({
        key: 'CANCELLED',
        title: 'Cancelled',
        description: `Order cancelled (${order.cancelReason || 'User request'})`,
        completed: true,
        timestamp: order.cancelledAt || order.updatedAt,
      });
    }

    return {
      success: true,
      orderId: order.id,
      currentStatus: order.orderStatus,
      timeline: steps,
    };
  }

  private getCourierTrackingUrl(
    courier: string | null,
    awb: string | null,
  ): string {
    if (!awb) return '';
    const c = (courier || '').toLowerCase();
    if (c.includes('delhivery')) {
      return `https://www.delhivery.com/track/package/${awb}`;
    }
    if (c.includes('shiprocket')) {
      return `https://shiprocket.co/tracking/${awb}`;
    }
    if (c.includes('bluedart') || c.includes('blue dart')) {
      return 'https://www.bluedart.com/tracking';
    }
    if (c.includes('dtdc')) {
      return 'https://www.dtdc.in/tracking.asp';
    }
    return `https://track.kickat.in/shipment/${awb}`;
  }

  /**
   * GET /orders/:id/tracking
   */
  async getOrderTracking(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    const awb = order.trackingNumber || null;
    const courier = order.courierPartner || null;
    const trackingUrl = this.getCourierTrackingUrl(courier, awb);

    const isRTO =
      order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
      order.orderStatus === OrderStatusEnum.RETURNED;
    const isCancelled = order.orderStatus === OrderStatusEnum.CANCELLED;

    // Standard progression milestones
    const statusOrder: OrderStatusEnum[] = [
      OrderStatusEnum.PLACED,
      OrderStatusEnum.PROCESSING,
      OrderStatusEnum.PACKED,
      OrderStatusEnum.SHIPPED,
      OrderStatusEnum.OUT_FOR_DELIVERY,
      OrderStatusEnum.DELIVERED,
    ];

    const currentStatusIndex = statusOrder.indexOf(order.orderStatus);

    // Dynamic timeline matching Admin milestones without fabricating future timestamps
    const timeline = isCancelled
      ? [
          {
            stage: 'ORDER_PLACED',
            title: 'Order Placed & Confirmed',
            location: 'Online Platform',
            timestamp: order.createdAt,
            isCompleted: true,
            isCurrent: false,
            description: 'Customer order placed and payment verified.',
          },
          {
            stage: 'CANCELLED',
            title: 'Order Cancelled',
            location: 'Online Platform',
            timestamp: order.cancelledAt || order.updatedAt,
            isCompleted: true,
            isCurrent: true,
            description: order.cancelReason
              ? `Reason: ${order.cancelReason}`
              : 'Order was cancelled.',
          },
        ]
      : [
          {
            stage: 'ORDER_PLACED',
            title: 'Order Placed & Confirmed',
            location: 'Online Platform',
            timestamp: order.createdAt,
            isCompleted: true,
            isCurrent: currentStatusIndex <= 0,
            description: 'Customer order placed and payment verified.',
          },
          {
            stage: 'PACKED',
            title: 'Packed at Warehouse',
            location: 'Kickat Central Hub, Mumbai',
            timestamp: currentStatusIndex >= 2 ? order.updatedAt : null,
            isCompleted: currentStatusIndex >= 2 || isRTO,
            isCurrent: currentStatusIndex === 1 || currentStatusIndex === 2,
            description: 'Items picked, verified, and safely packed.',
          },
          {
            stage: 'SHIPPED',
            title: 'Handed Over to Courier',
            location: 'Mumbai Logistics Hub',
            timestamp: currentStatusIndex >= 3 ? order.updatedAt : null,
            isCompleted: currentStatusIndex >= 3 || isRTO,
            isCurrent: currentStatusIndex === 3,
            description:
              courier && awb
                ? `Package picked up by ${courier} under AWB ${awb}.`
                : 'Package handed over to logistics carrier.',
          },
          {
            stage: 'IN_TRANSIT',
            title: 'In Transit to Destination Hub',
            location: `${order.address?.city || 'Destination'} Regional Sorting Facility`,
            timestamp: currentStatusIndex >= 3 ? order.updatedAt : null,
            isCompleted: currentStatusIndex >= 3 || isRTO,
            isCurrent: currentStatusIndex === 3,
            description: 'Package in transit between logistics hubs.',
          },
          {
            stage: 'OUT_FOR_DELIVERY',
            title: 'Out for Delivery',
            location: `${order.address?.city || 'Local'} Delivery Center`,
            timestamp: currentStatusIndex >= 4 ? order.updatedAt : null,
            isCompleted: currentStatusIndex >= 4,
            isCurrent: currentStatusIndex === 4,
            description: 'Delivery executive assigned and out for delivery.',
          },
          {
            stage: isRTO ? 'RTO_INITIATED' : 'DELIVERED',
            title: isRTO ? 'Return to Origin (RTO)' : 'Delivered to Recipient',
            location:
              `${order.address?.city || ''}, ${order.address?.state || ''}`.trim() ||
              'Customer Address',
            timestamp:
              order.orderStatus === OrderStatusEnum.DELIVERED ||
              order.orderStatus === OrderStatusEnum.RETURNED
                ? order.deliveryDate || order.updatedAt
                : null,
            isCompleted:
              order.orderStatus === OrderStatusEnum.DELIVERED ||
              order.orderStatus === OrderStatusEnum.RETURNED,
            isCurrent:
              order.orderStatus === OrderStatusEnum.DELIVERED ||
              order.orderStatus === OrderStatusEnum.RETURNED,
            description: isRTO
              ? 'Shipment marked for Return to Origin.'
              : 'Package safely delivered to recipient address.',
          },
        ];

    let currentLocation = 'Online Platform';
    if (isCancelled) {
      currentLocation = 'Order Cancelled';
    } else if (order.orderStatus === OrderStatusEnum.DELIVERED) {
      currentLocation =
        `${order.address?.city || ''}, ${order.address?.state || ''}`.trim() ||
        'Delivered';
    } else if (currentStatusIndex >= 4) {
      currentLocation = `${order.address?.city || 'Local'} Delivery Center`;
    } else if (currentStatusIndex >= 3) {
      currentLocation = `${order.address?.city || 'Regional'} Sorting Facility`;
    } else if (currentStatusIndex >= 2) {
      currentLocation = 'Kickat Central Hub, Mumbai';
    } else if (courier && awb) {
      currentLocation = 'Kickat Logistics Facility, Mumbai';
    }

    const checkpoints = timeline.filter((t) => t.isCompleted);

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: awb,
      awbNumber: awb,
      courierPartner: courier,
      trackingUrl: trackingUrl || null,
      status: order.orderStatus,
      currentStatus: order.orderStatus,
      isRTO,
      isCancelled,
      // Additive: lets the tracking screen show/hide a Cancel Order action.
      cancellable: this.isCancellable(order),
      cancellationBlockedReason: this.getCancellationBlockedReason(order),
      origin: 'Kickat Central Warehouse, Mumbai, Maharashtra',
      destination: order.address
        ? `${order.address.city || ''}, ${order.address.state || ''} ${order.address.pincode || ''}`.trim()
        : 'Customer Address',
      location: currentLocation,
      lastUpdated: order.updatedAt || order.createdAt,
      estimatedDelivery: order.estimatedDelivery || order.deliveryDate || null,
      checkpoints,
      timeline,
      history: checkpoints.map((cp) => ({
        location: cp.location,
        status: cp.title,
        timestamp: cp.timestamp || order.createdAt,
      })),
    };
  }

  /**
   * GET /orders/:id/tracking-live
   */
  async getOrderTrackingLive(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    return {
      success: true,
      orderId: order.id,
      trackingNumber: order.trackingNumber || `TRK-${order.orderNumber}`,
      status: order.orderStatus,
      agent: {
        name: 'Ramesh Kumar',
        phone: '+919876543210',
        vehicleNumber: 'MH-02-AB-1234',
      },
      liveLocation: {
        latitude: 19.076,
        longitude: 72.8777,
        lastUpdated: new Date(),
      },
      etaMinutes: 25,
    };
  }

  /**
   * GET /orders/:id/invoice
   */

  /**
   * GET /orders/:id/invoice/pdf
   */
  async getOrderInvoicePdf(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);
    const taxSettings = await this.settingsService.getTaxSettingsRaw();
    const generalSettings = await this.settingsService.getGeneralSettingsRaw();

    const buffer = await this.invoicePdfService.generateInvoicePdf({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      subtotal: order.subtotal,
      gstPercentage: order.gstPercentage,
      gstAmount: order.gstAmount,
      deliveryFee: order.deliveryFee,
      codFee: order.codFee,
      extraFeeName: order.extraFeeName,
      extraFeeAmount: order.extraFeeAmount,
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      user: order.user,
      address: order.address,
      items: order.items,
      storeSettings: {
        supportEmail: generalSettings.supportEmail,
        supportPhone: generalSettings.supportPhone,
        gstNumber: taxSettings.gstNumber,
      },
    });

    return { buffer, orderNumber: order.orderNumber };
  }

  async getOrderInvoice(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    const taxSettings = await this.settingsService.getTaxSettingsRaw();
    const gstEnabled = Boolean(taxSettings.gstEnabled);
    const gstPercentage = Number(taxSettings.gstPercentage ?? 0);
    const taxAmount = gstEnabled
      ? Math.round(order.subtotal * (gstPercentage / 100) * 100) / 100
      : 0;

    return {
      success: true,
      invoice: {
        invoiceNumber: `INV-${order.orderNumber}`,
        invoiceDate: order.createdAt,
        orderId: order.id,
        orderNumber: order.orderNumber,
        billingAddress: order.address,
        items: order.items,
        summary: {
          subtotal: order.subtotal,
          gstEnabled: (order.gstPercentage ?? 0) > 0,
          gstNumber: taxSettings.gstNumber || null,
          gstPercentage: order.gstPercentage ?? 0,
          gstAmount: order.gstAmount ?? 0,
          taxAmount: order.gstAmount ?? 0,
          extraFeeName: order.extraFeeName,
          extraFeeAmount: order.extraFeeAmount ?? 0,
          deliveryFee: order.deliveryFee,
          codFee: order.codFee ?? 0,
          grandTotal: order.grandTotal,
        },
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        downloadUrl: `/api/v1/orders/${order.id}/invoice/pdf`,
      },
    };
  }

  /**
   * PATCH /orders/:id/cancel
   */
  async cancelOrder(userId: string, id: string, dto: CancelOrderDto) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);
    const oldStatus = order.orderStatus;

    const nonCancellableStatuses: OrderStatusEnum[] = [
      OrderStatusEnum.PACKED,
      OrderStatusEnum.SHIPPED,
      OrderStatusEnum.OUT_FOR_DELIVERY,
      OrderStatusEnum.DELIVERED,
      OrderStatusEnum.CANCELLED,
      OrderStatusEnum.RETURNED,
      OrderStatusEnum.RETURN_INITIATED,
    ];

    // GUARD 1 — status must still be pre-shipment. Message now reflects the
    // order's ACTUAL state instead of always claiming it was already shipped.
    if (nonCancellableStatuses.includes(order.orderStatus)) {
      throw new ConflictException(
        this.getCancellationBlockedReason(order) ??
          'This order can no longer be cancelled.',
      );
    }

    // GUARD 2 — even in a pre-shipment status, once the courier has an AWB or
    // a provider shipment exists, the parcel is in motion. Never allow cancel.
    if (order.trackingNumber || order.shiprocketShipmentId) {
      throw new ConflictException(
        'Order has already been handed to the courier and can no longer be cancelled. Please contact support for assistance.',
      );
    }

    // GUARD 3 — a reason is mandatory, and "other" must carry a note.
    if (!dto.reason) {
      throw new BadRequestException('A cancellation reason is required');
    }
    const reasonNote = dto.reasonOther?.trim() || null;
    if (dto.reason === CancelReasonEnum.OTHER && !reasonNote) {
      throw new BadRequestException(
        'reasonOther is required when the cancellation reason is "other"',
      );
    }

    const reasonLabel = CANCEL_REASON_LABELS[dto.reason] ?? dto.reason;

    const restoredEvents: Array<{
      productId: string;
      variantId?: string | null;
      previousStock: number;
      newStock: number;
    }> = [];

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Atomic re-check: the status must still be cancellable AND no AWB /
      // shipment may have appeared between the guard above and this write
      // (the auto-shipment job can assign one concurrently).
      const updateRes = await tx.order.updateMany({
        where: {
          id: order.id,
          userId,
          orderStatus: { notIn: nonCancellableStatuses },
          OR: [{ trackingNumber: null }, { trackingNumber: '' }],
          shiprocketShipmentId: null,
        },
        data: {
          orderStatus: OrderStatusEnum.CANCELLED,
          // Human-readable label kept in the existing cancelReason field for
          // backward compatibility; machine code stored separately.
          cancelReason: reasonLabel,
          cancelReasonCode: dto.reason,
          cancelReasonOther: reasonNote,
          cancelledAt: new Date(),
        },
      });

      if (updateRes.count === 0) {
        throw new ConflictException(
          'This order can no longer be cancelled — it has just been handed to the courier or its status changed. Please refresh and try again.',
        );
      }

      // Atomically restore deducted stock for all order items
      for (const item of order.items) {
        if (item.variantId) {
          const curVariant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            select: { stock: true },
          });
          const pStock = curVariant ? curVariant.stock : 0;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
          restoredEvents.push({
            productId: item.productId,
            variantId: item.variantId,
            previousStock: pStock,
            newStock: pStock + item.quantity,
          });
        } else {
          const curProduct = await tx.product.findUnique({
            where: { id: item.productId },
            select: { stock: true },
          });
          const pStock = curProduct ? curProduct.stock : 0;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          restoredEvents.push({
            productId: item.productId,
            previousStock: pStock,
            newStock: pStock + item.quantity,
          });
        }
      }

      return {
        id: order.id,
        orderStatus: OrderStatusEnum.CANCELLED,
      };
    });

    for (const evt of restoredEvents) {
      this.stockAlertService.evaluateStockChange(evt).catch(() => {});
    }

    this.notificationsService.notifyOrderStatusChange({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      oldStatus,
      newStatus: 'CANCELLED',
    });

    // ---- Post-cancel side effects -----------------------------------------
    // Both are best-effort: the order is already CANCELLED and the customer's
    // request has succeeded. Neither failure may propagate.

    // 1. Refund any money that was actually captured.
    let refund: {
      required: boolean;
      initiated: boolean;
      message: string;
      amount?: number;
      providerRefundId?: string | null;
    } = {
      required: false,
      initiated: false,
      message: 'No payment captured — no refund required',
    };

    if (order.paymentStatus === PaymentStatusEnum.COMPLETED) {
      refund.required = true;

      if (this.paymentsService) {
        try {
          const result = await this.paymentsService.initiateRefundForOrder({
            orderId: order.id,
            reason: reasonNote ? `${reasonLabel} — ${reasonNote}` : reasonLabel,
            actorType: 'CUSTOMER',
          });
          refund = {
            required: true,
            initiated: result.refundInitiated,
            message: result.message,
            amount: result.amount,
            providerRefundId: result.providerRefundId ?? null,
          };
        } catch (refundErr: any) {
          // initiateRefundForOrder is already non-throwing, but stay defensive:
          // a refund problem must never undo a successful cancellation.
          this.logger.error(
            `Refund initiation threw for cancelled order ${order.orderNumber}: ${refundErr?.message || refundErr}`,
          );
          refund = {
            required: true,
            initiated: false,
            message:
              'Order cancelled, but the refund could not be initiated automatically. Our team will process it shortly.',
          };
        }
      } else {
        this.logger.warn(
          `PaymentsService unavailable; refund for cancelled order ${order.orderNumber} must be processed manually.`,
        );
        refund = {
          required: true,
          initiated: false,
          message:
            'Order cancelled. Refund will be processed manually by our team.',
        };
      }
    }

    // 2. Cancel the provider shipment if one somehow exists (fire-and-forget).
    if (
      this.shippingService &&
      (order.shiprocketOrderId || order.shiprocketShipmentId)
    ) {
      void this.shippingService
        .cancelShipmentForOrder(order.id)
        .then((res) => {
          if (!res.success) {
            this.logger.warn(
              `Provider shipment cancellation did not succeed for order ${order.orderNumber}: ${res.message}`,
            );
          }
        })
        .catch((shipErr: any) => {
          this.logger.warn(
            `Provider shipment cancellation failed for order ${order.orderNumber}: ${shipErr?.message || shipErr}`,
          );
        });
    }

    return {
      success: true,
      message: 'Order cancelled successfully',
      orderId: updatedOrder.id,
      status: updatedOrder.orderStatus,
      // Additive cancellation detail for the client.
      cancelReason: reasonLabel,
      cancelReasonCode: dto.reason,
      cancelReasonOther: reasonNote,
      refund,
    };
  }

  /**
   * POST /orders/:id/return
   */
  async returnOrder(userId: string, id: string, dto: ReturnOrderDto) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    if (order.orderStatus !== OrderStatusEnum.DELIVERED) {
      throw new ConflictException('Order is not delivered');
    }

    // Check 7-day return window
    const deliveryDate = order.deliveryDate || order.updatedAt;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(deliveryDate).getTime() > SEVEN_DAYS_MS) {
      throw new ConflictException('Return window expired');
    }

    // Check if return is already initiated
    if (order.returns && order.returns.length > 0) {
      throw new ConflictException('Return already initiated for this order');
    }

    // Verify order item eligibility
    const validOrderItemIds = new Set(order.items.map((i) => i.id));
    for (const item of dto.items) {
      if (!validOrderItemIds.has(item.orderItemId)) {
        throw new BadRequestException(
          `Item ${item.orderItemId} does not belong to this order`,
        );
      }
    }

    // Create return record atomically with conditional state check
    const returnRecord = await this.prisma.$transaction(async (tx) => {
      const updateRes = await tx.order.updateMany({
        where: {
          id: order.id,
          userId,
          orderStatus: OrderStatusEnum.DELIVERED,
        },
        data: {
          orderStatus: OrderStatusEnum.RETURN_INITIATED,
        },
      });

      if (updateRes.count === 0) {
        throw new ConflictException(
          'Order is not in delivered state or return already initiated',
        );
      }

      const ret = await tx.orderReturn.create({
        data: {
          orderId: order.id,
          userId,
          pickupInstructions: dto.pickupInstructions,
          status: 'INITIATED',
          items: {
            create: dto.items.map((item) => ({
              orderItemId: item.orderItemId,
              reason: item.reason,
              reasonOther: item.reasonOther,
              photos: item.photos || [],
            })),
          },
        },
      });

      return ret;
    });

    return {
      success: true,
      message: 'Return request submitted successfully',
      returnId: returnRecord.id,
      status: 'RETURN_INITIATED',
    };
  }

  /**
   * GET /orders/order-again
   */
  async getOrderAgain(userId: string, query?: OrderAgainQueryDto) {
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          userId,
          orderStatus: {
            notIn: [OrderStatusEnum.CANCELLED],
          },
        },
      },
      orderBy: {
        order: {
          createdAt: 'desc',
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            createdAt: true,
          },
        },
      },
    });

    // Aggregate unique products and variants
    const itemMap = new Map<
      string,
      {
        productId: string;
        variantId: string | null;
        productName: string;
        variantName: string | null;
        lastOrderedAt: Date;
        lastOrderId: string;
        lastOrderNumber: string;
        lastQuantity: number;
        timesOrdered: number;
        totalQuantityOrdered: number;
      }
    >();

    for (const item of orderItems) {
      const key = `${item.productId}_${item.variantId || 'base'}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          productId: item.productId,
          variantId: item.variantId || null,
          productName: item.productName,
          variantName: item.variantName || null,
          lastOrderedAt: item.order.createdAt,
          lastOrderId: item.order.id,
          lastOrderNumber: item.order.orderNumber,
          lastQuantity: item.quantity,
          timesOrdered: 1,
          totalQuantityOrdered: item.quantity,
        });
      } else {
        const existing = itemMap.get(key)!;
        existing.timesOrdered += 1;
        existing.totalQuantityOrdered += item.quantity;
      }
    }

    const aggregatedList = Array.from(itemMap.values());
    const total = aggregatedList.length;
    const pagedEntries = aggregatedList.slice(skip, skip + limit);

    // Fetch full product and variant information using batch queries (eliminates N+1 queries)
    const pagedProductIds = Array.from(
      new Set(pagedEntries.map((e) => e.productId)),
    );
    const pagedVariantIds = Array.from(
      new Set(pagedEntries.map((e) => e.variantId).filter(Boolean)),
    ) as string[];

    let products: any[] = [];
    let variants: any[] = [];

    if (pagedProductIds.length > 0) {
      products = await this.prisma.product.findMany({
        where: { id: { in: pagedProductIds } },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
    }

    if (pagedVariantIds.length > 0) {
      variants = await this.prisma.productVariant.findMany({
        where: { id: { in: pagedVariantIds } },
      });
    }

    const productMap = new Map<string, any>(
      products.map((p: any) => [p.id, p]),
    );
    const variantMap = new Map<string, any>(
      variants.map((v: any) => [v.id, v]),
    );

    const items = pagedEntries.map((entry) => {
      const product = productMap.get(entry.productId) || null;
      const variant = entry.variantId
        ? variantMap.get(entry.variantId) || null
        : null;

      const inStock = product
        ? (variant ? variant.stock > 0 : product.stock > 0) &&
          product.status === 'ACTIVE'
        : false;
      const availableStock = product
        ? variant
          ? variant.stock
          : product.stock
        : 0;

      return {
        productId: entry.productId,
        variantId: entry.variantId || null,
        productName: product?.name || entry.productName,
        variantName: variant?.name || entry.variantName || null,
        lastOrderedAt: entry.lastOrderedAt,
        lastOrderId: entry.lastOrderId,
        lastOrderNumber: entry.lastOrderNumber,
        lastQuantity: entry.lastQuantity,
        timesOrdered: entry.timesOrdered,
        totalQuantityOrdered: entry.totalQuantityOrdered,
        inStock,
        availableStock,
        product: product
          ? {
              id: product.id,
              name: product.name,
              slug: product.slug,
              price: product.price,
              discountPrice: product.discountPrice,
              imageUrl: product.imageUrl,
              rating: product.rating,
              reviewsCount: product.reviewsCount,
              stock: product.stock,
              category: product.category,
            }
          : null,
        variant: variant
          ? {
              id: variant.id,
              name: variant.name,
              price: variant.price,
              stock: variant.stock,
            }
          : null,
      };
    });

    return {
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * POST /orders/:id/reorder or POST /orders/reorder
   */
  async reorder(userId: string, idOrDto: string | ReorderDto) {
    if (typeof idOrDto === 'string') {
      return this.reorderFromOrder(userId, idOrDto);
    }

    const dto = idOrDto;

    if (dto.orderId) {
      return this.reorderFromOrder(userId, dto.orderId);
    }

    if (dto.items && dto.items.length > 0) {
      return this.reorderItemsList(userId, dto.items);
    }

    if (dto.productId) {
      return this.reorderSingleProduct(
        userId,
        dto.productId,
        dto.variantId,
        dto.quantity || 1,
      );
    }

    throw new BadRequestException(
      'orderId, productId, or items array is required to reorder',
    );
  }

  private async reorderFromOrder(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    if (!order.items || order.items.length === 0) {
      throw new BadRequestException('Order has no items to reorder');
    }

    // Check stock / active products using batch lookups
    const productIds = Array.from(new Set(order.items.map((i) => i.productId)));
    const variantIds = Array.from(
      new Set(order.items.map((i) => i.variantId).filter(Boolean)),
    ) as string[];

    const [products, variants] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } } }),
      variantIds.length > 0
        ? this.prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
          })
        : Promise.resolve<any[]>([]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map<string, any>(
      (variants as any[]).map((v) => [v.id, v]),
    );

    for (const item of order.items) {
      const product = productMap.get(item.productId);
      if (!product || product.stock < 1) {
        throw new ConflictException(
          `Product '${item.productName}' is out of stock or discontinued`,
        );
      }

      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.stock < 1) {
          throw new ConflictException(
            `Variant '${item.variantName || item.productName}' is out of stock or discontinued`,
          );
        }
      }
    }

    // Add items to cart
    for (const item of order.items) {
      await this.prisma.cartItem.upsert({
        where: {
          userId_productId_variantId: {
            userId,
            productId: item.productId,
            variantId: item.variantId ?? (undefined as any),
          },
        },
        create: {
          userId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        },
        update: {
          quantity: { increment: item.quantity },
        },
      });
    }

    return {
      success: true,
      message: 'Items added to cart successfully',
      reorderedItemsCount: order.items.length,
      orderId: order.id,
    };
  }

  private async reorderItemsList(userId: string, items: ReorderItemDto[]) {
    for (const item of items) {
      this.validateUuid(item.productId, 'productId');
      if (item.variantId) {
        this.validateUuid(item.variantId, 'variantId');
      }
    }

    // Check stock for all items using batch lookups
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const variantIds = Array.from(
      new Set(items.map((i) => i.variantId).filter(Boolean)),
    ) as string[];

    const [products, variants] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } } }),
      variantIds.length > 0
        ? this.prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
          })
        : Promise.resolve<any[]>([]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map<string, any>(
      (variants as any[]).map((v) => [v.id, v]),
    );

    for (const item of items) {
      const product = productMap.get(item.productId);
      const requiredQty = item.quantity || 1;
      if (!product || product.stock < requiredQty) {
        throw new ConflictException(
          `Product '${product?.name || item.productId}' is out of stock or discontinued`,
        );
      }

      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.stock < requiredQty) {
          throw new ConflictException(
            `Variant '${variant?.name || item.variantId}' is out of stock or discontinued`,
          );
        }
      }
    }

    // Add each item to cart
    for (const item of items) {
      const qty = item.quantity || 1;
      await this.prisma.cartItem.upsert({
        where: {
          userId_productId_variantId: {
            userId,
            productId: item.productId,
            variantId: item.variantId ?? (undefined as any),
          },
        },
        create: {
          userId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: qty,
        },
        update: {
          quantity: { increment: qty },
        },
      });
    }

    return {
      success: true,
      message: 'Items added to cart successfully',
      reorderedItemsCount: items.length,
    };
  }

  private async reorderSingleProduct(
    userId: string,
    productId: string,
    variantId?: string,
    quantity: number = 1,
  ) {
    this.validateUuid(productId, 'productId');
    if (variantId) {
      this.validateUuid(variantId, 'variantId');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.stock < quantity) {
      throw new ConflictException(
        `Product '${product?.name || productId}' is out of stock or discontinued`,
      );
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
      });

      if (!variant || variant.stock < quantity) {
        throw new ConflictException(
          `Variant '${variant?.name || variantId}' is out of stock or discontinued`,
        );
      }
    }

    await this.prisma.cartItem.upsert({
      where: {
        userId_productId_variantId: {
          userId,
          productId,
          variantId: variantId ?? (undefined as any),
        },
      },
      create: {
        userId,
        productId,
        variantId,
        quantity,
      },
      update: {
        quantity: { increment: quantity },
      },
    });

    return {
      success: true,
      message: 'Item added to cart successfully',
      reorderedItemsCount: 1,
    };
  }

  /**
   * GET /returns
   */
  async getReturns(userId: string, query: GetReturnsQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (query.status) {
      where.status = query.status.toUpperCase();
    }

    const [returns, total] = await Promise.all([
      this.prisma.orderReturn.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          order: {
            select: {
              orderNumber: true,
              grandTotal: true,
              orderStatus: true,
            },
          },
        },
      }),
      this.prisma.orderReturn.count({ where }),
    ]);

    return {
      success: true,
      returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /returns/:id
   */
  async getReturnById(userId: string, id: string) {
    this.validateUuid(id, 'id');

    const returnRecord = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            orderItem: true,
          },
        },
        order: {
          include: {
            address: true,
            payments: true,
          },
        },
      },
    });

    if (!returnRecord) {
      throw new NotFoundException('Return not found');
    }

    if (returnRecord.userId !== userId) {
      throw new ForbiddenException('Not your return');
    }

    return {
      success: true,
      return: returnRecord,
    };
  }
}
