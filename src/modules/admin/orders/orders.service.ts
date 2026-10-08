import { InvoicePdfService } from "../../orders/invoice-pdf.service";
import { NotificationsService } from "../../notifications/notifications.service";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ShippingService } from '../shipping/shipping.service';
import { PaymentsService } from '../../payments/payments.service';
import {
  AdminCancelOrderDto,
  AdminOrderSortEnum,
  AdminOrdersQueryDto,
  AdminRefundOrderDto,
  ConfirmCodRefundDto,
  UpdateOrderStatusDto,
} from './dto/admin-order.dto';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly settingsService: SettingsService,
    @Optional() private readonly shippingService?: ShippingService,
    @Optional() private readonly paymentsService?: PaymentsService,
  ) {}

  /**
   * Helper to find order by UUID or orderNumber
   */
  private async enrichItemsWithProductData(items: any[]): Promise<any[]> {
    if (!items || items.length === 0) return items;

    const productIds = Array.from(new Set(items.map((i) => i.productId).filter(Boolean)));
    const variantIds = Array.from(new Set(items.map((i) => i.variantId).filter(Boolean))) as string[];

    const products: any[] =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, slug: true, imageUrl: true, images: true, name: true, brand: true, petSpecies: true },
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
        (Array.isArray(variant?.images) && variant.images.length > 0 ? variant.images[0] : null) ||
        prod?.imageUrl ||
        (Array.isArray(prod?.images) && prod.images.length > 0 ? prod.images[0] : null) ||
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

  private async findOrderByIdOrNumber(idOrNumber: string) {
    const isUuid = UUID_V4_REGEX.test(idOrNumber);

    const order = await this.prisma.order.findFirst({
      where: isUuid ? { id: idOrNumber } : { orderNumber: idOrNumber },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        address: true,
        items: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        returns: {
          include: { items: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.items && order.items.length > 0) {
      order.items = await this.enrichItemsWithProductData(order.items);
    }

    return order;
  }

  /**
   * GET /api/v1/admin/orders
   * Filter, search, sort, and paginate orders with KPI summary counters
   */
  async getOrders(query: AdminOrdersQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.orderStatus = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.customerId) {
      where.userId = query.customerId;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    if (query.orderId) {
      const isUuid = UUID_V4_REGEX.test(query.orderId);
      if (isUuid) {
        where.id = query.orderId;
      } else {
        where.orderNumber = { contains: query.orderId.trim(), mode: 'insensitive' };
      }
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { trackingNumber: { contains: s, mode: 'insensitive' } },
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
        { user: { phone: { contains: s, mode: 'insensitive' } } },
        { items: { some: { productName: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminOrderSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminOrderSortEnum.TOTAL_DESC:
        orderBy = { grandTotal: 'desc' };
        break;
      case AdminOrderSortEnum.TOTAL_ASC:
        orderBy = { grandTotal: 'asc' };
        break;
      case AdminOrderSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [
      orders,
      total,
      revenueAgg,
      pendingCount,
      processingCount,
      packedCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      returnedCount,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          address: true,
          items: true,
          payments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          returns: {
            select: { id: true, status: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: { ...where, orderStatus: { not: OrderStatusEnum.CANCELLED } },
      }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.PENDING } }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.PROCESSING } }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.PACKED } }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.SHIPPED } }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.DELIVERED } }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.CANCELLED } }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.RETURNED, OrderStatusEnum.RETURN_INITIATED] },
        },
      }),
    ]);

    const formattedOrders = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity}`)
        .join(', ');

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customer: {
          id: order.user?.id || order.userId,
          name: order.user?.name || 'Customer',
          email: order.user?.email || null,
          phone: order.user?.phone || null,
        },
        shippingAddress: order.address,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        grandTotal: order.grandTotal,
        itemsCount,
        itemsSummary,
        items: order.items,
        trackingNumber: order.trackingNumber,
        courierPartner: order.courierPartner,
        estimatedDelivery: order.estimatedDelivery,
        hasReturns: order.returns.length > 0,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        orders: formattedOrders,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalOrders: total,
          totalRevenue: Number((revenueAgg._sum.grandTotal ?? 0).toFixed(2)),
          pendingCount,
          processingCount,
          packedCount,
          shippedCount,
          deliveredCount,
          cancelledCount,
          returnedCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/orders/:id
   * Complete detailed view of an order
   */
  async getOrderById(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

    const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

    const productIds = Array.from(new Set(order.items.map((i) => i.productId)));
    const products = (productIds.length > 0 && typeof this.prisma.product?.findMany === 'function') ? await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        shippingWeightKg: true,
        shippingLengthCm: true,
        shippingBreadthCm: true,
        shippingHeightCm: true,
        imageUrl: true,
        variants: {
          select: {
            id: true,
            shippingWeightKg: true,
            shippingLengthCm: true,
            shippingBreadthCm: true,
            shippingHeightCm: true,
            imageUrl: true,
          },
        },
      },
    }) : [];

    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    let totalWeightKg = 0;
    let maxLengthCm = 0;
    let maxBreadthCm = 0;
    let totalHeightCm = 0;

    const enrichedItems = order.items.map((item) => {
      const prod = productMap.get(item.productId);
      const variant = item.variantId && prod?.variants ? prod.variants.find((v: any) => v.id === item.variantId) : null;

      const weightKg = (typeof variant?.shippingWeightKg === "number" && variant.shippingWeightKg > 0)
        ? variant.shippingWeightKg
        : (typeof prod?.shippingWeightKg === "number" && prod.shippingWeightKg > 0)
          ? prod.shippingWeightKg
          : null;

      const lengthCm = (typeof variant?.shippingLengthCm === "number" && variant.shippingLengthCm > 0)
        ? variant.shippingLengthCm
        : (typeof prod?.shippingLengthCm === "number" && prod.shippingLengthCm > 0)
          ? prod.shippingLengthCm
          : null;

      const breadthCm = (typeof variant?.shippingBreadthCm === "number" && variant.shippingBreadthCm > 0)
        ? variant.shippingBreadthCm
        : (typeof prod?.shippingBreadthCm === "number" && prod.shippingBreadthCm > 0)
          ? prod.shippingBreadthCm
          : null;

      const heightCm = (typeof variant?.shippingHeightCm === "number" && variant.shippingHeightCm > 0)
        ? variant.shippingHeightCm
        : (typeof prod?.shippingHeightCm === "number" && prod.shippingHeightCm > 0)
          ? prod.shippingHeightCm
          : null;

      const productImage = variant?.imageUrl || prod?.imageUrl || null;

      if (weightKg) totalWeightKg += weightKg * (item.quantity || 1);
      if (lengthCm && lengthCm > maxLengthCm) maxLengthCm = lengthCm;
      if (breadthCm && breadthCm > maxBreadthCm) maxBreadthCm = breadthCm;
      if (heightCm) totalHeightCm += heightCm * (item.quantity || 1);

      return {
        ...item,
        productImage: (item as any).productImage || productImage,
        shippingWeightKg: weightKg,
        shippingLengthCm: lengthCm,
        shippingBreadthCm: breadthCm,
        shippingHeightCm: heightCm,
      };
    });

    const packageDetails = {
      totalWeightKg: totalWeightKg > 0 ? Number(totalWeightKg.toFixed(2)) : null,
      lengthCm: maxLengthCm > 0 ? maxLengthCm : null,
      breadthCm: maxBreadthCm > 0 ? maxBreadthCm : null,
      heightCm: totalHeightCm > 0 ? totalHeightCm : null,
    };

    return {
      success: true,
      data: {
        ...order,
        items: enrichedItems,
        itemsCount,
        packageDetails,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/orders/:id/status
   * Advance or update order lifecycle status
   */
  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrderByIdOrNumber(id);
    const oldStatus = order.orderStatus;

    let targetPaymentStatus: PaymentStatusEnum | undefined = dto.paymentStatus;
    if (
      !targetPaymentStatus &&
      dto.status === OrderStatusEnum.DELIVERED &&
      order.paymentMethod === PaymentMethodEnum.COD &&
      order.paymentStatus === PaymentStatusEnum.PENDING
    ) {
      targetPaymentStatus = PaymentStatusEnum.COMPLETED;
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: dto.status,
        ...(targetPaymentStatus !== undefined && { paymentStatus: targetPaymentStatus }),
        ...(dto.trackingNumber !== undefined && { trackingNumber: dto.trackingNumber }),
        ...(dto.courierPartner !== undefined && { courierPartner: dto.courierPartner }),
        ...(dto.estimatedDelivery !== undefined && {
          estimatedDelivery: new Date(dto.estimatedDelivery),
        }),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (targetPaymentStatus === PaymentStatusEnum.COMPLETED) {
      await this.prisma.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.COMPLETED },
      });
    } else if (targetPaymentStatus === PaymentStatusEnum.FAILED) {
      await this.prisma.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatusEnum.PENDING },
        data: { status: PaymentStatusEnum.FAILED },
      });
    } else if (targetPaymentStatus === PaymentStatusEnum.REFUNDED) {
      await this.prisma.payment.updateMany({
        where: { orderId: order.id },
        data: { status: PaymentStatusEnum.REFUNDED },
      });
    }

    this.notificationsService.notifyOrderStatusChange({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      userId: updated.userId,
      oldStatus,
      newStatus: updated.orderStatus,
      trackingNumber: updated.trackingNumber,
      courierPartner: updated.courierPartner,
      estimatedDelivery: updated.estimatedDelivery,
    });

    return {
      success: true,
      message: `Order status updated to ${dto.status}`,
      data: updated,
    };
  }

  /**
   * POST /api/v1/admin/orders/:id/cancel
   * Cancel order and automatically restock product inventory
   */
  async cancelOrder(id: string, dto: AdminCancelOrderDto, adminId?: string) {
    const order = await this.findOrderByIdOrNumber(id);
    const oldStatus = order.orderStatus;

    if (order.orderStatus === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // 1. Atomically claim the cancellation. A concurrent admin cancel that
      // already committed makes this match nothing, so restock and the
      // provider cancel below can never run twice for the same order.
      const claim = await tx.order.updateMany({
        where: { id: order.id, orderStatus: { not: OrderStatusEnum.CANCELLED } },
        data: {
          orderStatus: OrderStatusEnum.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelReasonOther: dto.reasonOther || null,
        },
      });

      if (claim.count === 0) {
        throw new BadRequestException('Order is already cancelled');
      }

      // 2. Restock items if requested
      if (dto.restockItems !== false) {
        for (const item of order.items) {
          // Restock main product
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

          // Restock variant if item has variant
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
      }

      return tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });

    if (!updatedOrder) {
      throw new NotFoundException('Order not found');
    }

    this.notificationsService.notifyOrderStatusChange({
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      userId: updatedOrder.userId,
      oldStatus,
      newStatus: 'CANCELLED',
    });

    // ---- Post-cancel side effects -----------------------------------------
    // Both run only after the DB transaction has committed (so no transaction
    // is held open across an external HTTP call) and both are independent:
    // each is awaited in its own guard so one failing never blocks the other
    // and never rolls back the cancellation.

    // 3. Refund any money that was actually captured. Same placement and
    // semantics as the customer cancel flow, which refunds before touching
    // the provider shipment.
    const refund = await this.refundCancelledOrder(order, dto, adminId);

    // 4. Provider shipment sync.
    const shipmentCancellation = await this.cancelProviderShipment(
      order,
      oldStatus,
    );

    const warnings: string[] = [];
    if (shipmentCancellation.attempted && !shipmentCancellation.success) {
      warnings.push(
        'the courier shipment could not be cancelled automatically (cancel it in Shiprocket manually)',
      );
    }
    if (refund.attempted && !refund.success) {
      warnings.push(
        'the refund could not be initiated automatically (process it manually)',
      );
    }

    return {
      success: true,
      message:
        warnings.length > 0
          ? `Order cancelled and inventory restocked, but ${warnings.join(' and ')}.`
          : 'Order cancelled successfully and inventory restocked',
      data: updatedOrder,
      shipmentCancellation,
      refund,
    };
  }

  /**
   * Refunds a captured payment after an admin cancellation, reusing
   * PaymentsService.initiateRefundForOrder() — the exact same gateway path the
   * customer cancel flow uses — with the admin recorded as the actor.
   *
   * Never throws: the order is already CANCELLED and restocked, so a refund
   * problem must never undo that. The outcome is awaited and returned instead,
   * so the admin response never claims a refund succeeded when it did not.
   *
   * Double-refund protection:
   *  - Unpaid / COD-without-capture orders (paymentStatus != COMPLETED) are
   *    skipped outright, and initiateRefundForOrder re-reads the order and
   *    applies the same check itself, so a payment confirmed concurrently
   *    cannot slip through.
   *  - An order that already carries a live refund record (from the manual
   *    POST /admin/orders/:id/refund endpoint, a return, or an earlier
   *    cancellation) is skipped, because that endpoint records a refund
   *    without moving paymentStatus away from COMPLETED.
   *  - A successful initiation moves paymentStatus to REFUND_INITIATED, so a
   *    later manual refund call cannot stack a second gateway refund on top.
   */
  private async refundCancelledOrder(
    order: {
      id: string;
      orderNumber: string;
      grandTotal: number;
      paymentMethod: PaymentMethodEnum;
      paymentStatus: PaymentStatusEnum;
    },
    dto: AdminCancelOrderDto,
    adminId?: string,
  ): Promise<{
    attempted: boolean;
    success: boolean;
    status:
      | 'NOT_REQUIRED'
      | 'ALREADY_REFUNDED'
      | 'INITIATED'
      | 'FAILED'
      | 'UNAVAILABLE';
    amount: number | null;
    reason: string;
    providerRefundId: string | null;
  }> {
    // No money captured -> nothing to reverse (unpaid online order, or a COD
    // order that was never collected).
    if (order.paymentStatus !== PaymentStatusEnum.COMPLETED) {
      return {
        attempted: false,
        success: true,
        status: 'NOT_REQUIRED',
        amount: null,
        reason: `No payment captured — no refund required (paymentStatus=${order.paymentStatus})`,
        providerRefundId: null,
      };
    }

    // A refund already recorded for this order (manual admin refund, return,
    // or an earlier cancellation) must never be stacked with another one.
    const existingRefund = await this.prisma.refundAudit.findFirst({
      where: {
        orderId: order.id,
        status: { in: ['REFUND_INITIATED', 'REFUNDED', 'COD_REFUNDED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingRefund) {
      this.logger.warn(
        `Skipping automatic refund for cancelled order ${order.orderNumber} (id=${order.id}): a refund is already recorded (auditId=${existingRefund.id}, status=${existingRefund.status}, amount=₹${existingRefund.amount}).`,
      );
      return {
        attempted: false,
        success: true,
        status: 'ALREADY_REFUNDED',
        amount: existingRefund.amount,
        reason: `A refund is already recorded for this order (status=${existingRefund.status})`,
        providerRefundId: existingRefund.providerRefundId || null,
      };
    }

    if (!this.paymentsService) {
      this.logger.warn(
        `PaymentsService unavailable; refund of ₹${order.grandTotal} for cancelled order ${order.orderNumber} (id=${order.id}) must be processed manually.`,
      );
      return {
        attempted: true,
        success: false,
        status: 'UNAVAILABLE',
        amount: order.grandTotal,
        reason:
          'Payments service unavailable; the refund must be processed manually',
        providerRefundId: null,
      };
    }

    const reasonText = dto.reasonOther?.trim()
      ? `${dto.reason} — ${dto.reasonOther.trim()}`
      : dto.reason;

    try {
      const result = await this.paymentsService.initiateRefundForOrder({
        orderId: order.id,
        reason: reasonText,
        actorType: 'ADMIN',
        adminId,
      });

      if (!result.refundInitiated) {
        this.logger.error(
          `Automatic refund NOT initiated for cancelled order ${order.orderNumber} (id=${order.id}, amount=₹${order.grandTotal}): ${result.message}`,
        );
        return {
          attempted: true,
          success: false,
          status: 'FAILED',
          amount: result.amount ?? order.grandTotal,
          reason: result.message,
          providerRefundId: result.providerRefundId ?? null,
        };
      }

      this.logger.log(
        `Automatic refund initiated for cancelled order ${order.orderNumber} (id=${order.id}): amount=₹${result.amount ?? order.grandTotal}, refundId=${result.providerRefundId ?? 'n/a'}.`,
      );
      return {
        attempted: true,
        success: true,
        status: 'INITIATED',
        amount: result.amount ?? order.grandTotal,
        reason: result.message,
        providerRefundId: result.providerRefundId ?? null,
      };
    } catch (refundErr: any) {
      // initiateRefundForOrder is already non-throwing, but stay defensive: a
      // refund problem must never undo a successful cancellation.
      const message = refundErr?.message || String(refundErr);
      this.logger.error(
        `Refund initiation threw for cancelled order ${order.orderNumber} (id=${order.id}, amount=₹${order.grandTotal}): ${message}`,
      );
      return {
        attempted: true,
        success: false,
        status: 'FAILED',
        amount: order.grandTotal,
        reason: `Refund initiation failed: ${message}`,
        providerRefundId: null,
      };
    }
  }

  /**
   * Cancels the order's forward shipment with the shipping provider after an
   * admin cancellation, reusing ShippingService.cancelShipmentForOrder (the
   * same call the customer cancel flow makes). Uses the same detection fields
   * as the customer flow: shiprocketOrderId / shiprocketShipmentId.
   *
   * Like the customer flow this never throws — the order is already CANCELLED
   * in KickAt — but the outcome is awaited and returned so the admin response
   * never claims the shipment was cancelled when it was not.
   */
  private async cancelProviderShipment(
    order: {
      id: string;
      orderNumber: string;
      shiprocketOrderId?: string | null;
      shiprocketShipmentId?: string | null;
      trackingNumber?: string | null;
    },
    previousStatus: OrderStatusEnum,
  ): Promise<{ attempted: boolean; success: boolean; message: string }> {
    if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
      return {
        attempted: false,
        success: true,
        message: 'No provider shipment to cancel for this order',
      };
    }

    // A delivered / returned shipment is already closed at the provider.
    const closedShipmentStatuses: OrderStatusEnum[] = [
      OrderStatusEnum.DELIVERED,
      OrderStatusEnum.RETURNED,
      OrderStatusEnum.RETURN_INITIATED,
    ];
    if (closedShipmentStatuses.includes(previousStatus)) {
      this.logger.log(
        `Skipping provider shipment cancellation for order ${order.orderNumber} (id=${order.id}): shipment already closed (status was ${previousStatus}).`,
      );
      return {
        attempted: false,
        success: true,
        message: `Shipment already closed at provider (status was ${previousStatus})`,
      };
    }

    if (!this.shippingService) {
      this.logger.warn(
        `ShippingService unavailable; provider shipment for cancelled order ${order.orderNumber} (id=${order.id}, shipmentId=${order.shiprocketShipmentId}) must be cancelled manually.`,
      );
      return {
        attempted: true,
        success: false,
        message: 'Shipping service unavailable; cancel the shipment manually',
      };
    }

    try {
      const res = await this.shippingService.cancelShipmentForOrder(order.id);
      if (!res.success) {
        this.logger.warn(
          `Provider shipment cancellation did not succeed for order ${order.orderNumber} (id=${order.id}, shipmentId=${order.shiprocketShipmentId}, awb=${order.trackingNumber}): ${res.message}`,
        );
      }
      return { attempted: true, success: res.success, message: res.message };
    } catch (shipErr: any) {
      const message = shipErr?.message || String(shipErr);
      this.logger.error(
        `Provider shipment cancellation failed for order ${order.orderNumber} (id=${order.id}, shipmentId=${order.shiprocketShipmentId}, awb=${order.trackingNumber}): ${message}`,
      );
      return {
        attempted: true,
        success: false,
        message: `Provider shipment cancellation failed: ${message}`,
      };
    }
  }

  /**
   * POST /api/v1/admin/orders/:id/refund
   * Process full or partial refund
   */

  /**
   * POST /api/v1/admin/orders/:id/confirm-cod-refund
   * Manually confirm COD refund as completed after physical return receipt (RETURN_RECEIVED)
   */

  /**
   * POST /api/v1/admin/orders/returns/:returnId/confirm-received
   * Confirm physical receipt of returned goods at warehouse
   */
  async confirmReturnReceived(returnId: string) {
    const returnRecord = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: true },
    });

    if (!returnRecord) {
      throw new NotFoundException("Return record not found");
    }

    if (returnRecord.status === "RETURN_RECEIVED") {
      return {
        success: true,
        message: "Return is already marked as received",
        return: returnRecord,
      };
    }

    const updated = await this.prisma.orderReturn.update({
      where: { id: returnId },
      data: { status: "RETURN_RECEIVED" },
    });

    this.notificationsService.notifyReturnStatus({
      orderId: returnRecord.order.id,
      orderNumber: returnRecord.order.orderNumber,
      userId: returnRecord.order.userId,
      status: "RETURN_RECEIVED",
    });

    return {
      success: true,
      message: "Return physical receipt confirmed at warehouse",
      return: updated,
    };
  }

  
  /**
   * POST /api/v1/admin/orders/:id/confirm-cod-refund
   * Manually confirm COD refund as completed after physical return receipt (RETURN_RECEIVED)
   */
  
  /**
   * POST /api/v1/admin/orders/:id/confirm-cod-refund
   * Manually confirm COD refund as completed after physical return receipt (RETURN_RECEIVED)
   */
  
  /**
   * POST /api/v1/admin/orders/:id/confirm-cod-refund
   * Manually confirm COD refund as completed after physical return receipt (RETURN_RECEIVED)
   */
  async confirmCodRefund(id: string, dto: ConfirmCodRefundDto, adminId?: string) {
    const order = await this.findOrderByIdOrNumber(id);

    if ((order.paymentMethod as string) !== "COD") {
      throw new BadRequestException("Order payment method is not COD");
    }

    if (order.orderStatus === OrderStatusEnum.RETURNED) {
      throw new ConflictException("Order has already been marked as returned / refunded");
    }

    const returnRecord = await this.prisma.orderReturn.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });

    if (!returnRecord || returnRecord.status !== "RETURN_RECEIVED") {
      throw new BadRequestException(
        "COD refund can only be processed after physical return receipt (RETURN_RECEIVED)",
      );
    }

    const refundAmount = dto.amount ?? order.grandTotal;

    if (refundAmount <= 0) {
      throw new BadRequestException("Refund amount must be greater than 0");
    }

    if (refundAmount > order.grandTotal) {
      throw new BadRequestException(
        `Refund amount (₹${refundAmount}) cannot exceed order total (₹${order.grandTotal})`,
      );
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          orderStatus: { not: OrderStatusEnum.RETURNED },
        },
        data: {
          orderStatus: OrderStatusEnum.RETURNED,
          paymentStatus: PaymentStatusEnum.REFUNDED,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException("Order is already marked as returned / refunded");
      }

      const updatedReturn = await tx.orderReturn.update({
        where: { id: returnRecord.id },
        data: {
          status: "COD_REFUNDED",
          refundAmount,
          transactionReference: dto.transactionReference,
          refundedAt: now,
        },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          amount: refundAmount,
          currency: "INR",
          paymentMethod: order.paymentMethod,
          status: PaymentStatusEnum.REFUNDED,
          failureReason: `COD Refund: ${dto.transactionReference}. Notes: ${dto.notes || "N/A"}`,
        },
      });

      await tx.refundAudit.create({
        data: {
          orderId: order.id,
          orderReturnId: returnRecord.id,
          userId: order.userId,
          amount: refundAmount,
          currency: "INR",
          refundMethod: "COD",
          status: "COD_REFUNDED",
          provider: "MANUAL",
          transactionReference: dto.transactionReference,
          actorType: adminId ? "ADMIN" : "SYSTEM",
          initiatedByAdminId: adminId || null,
          confirmedByAdminId: adminId || null,
          initiatedAt: now,
          completedAt: now,
          idempotencyKey: `cod_refund_${returnRecord.id}`,
        },
      });

      return updatedReturn;
    });

    this.notificationsService.notifyRefundStatus({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: "COD_REFUND_SUCCESS",
      refundAmount: result?.refundAmount ?? refundAmount,
      transactionReference: dto.transactionReference,
    });

    return {
      success: true,
      message: "COD refund marked as successful",
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        refundAmount: Number((result?.refundAmount ?? refundAmount).toFixed(2)),
        currency: "INR",
        transactionReference: result?.transactionReference ?? dto.transactionReference,
        notes: dto.notes || null,
        refundedAt: result?.refundedAt ?? now,
        status: "COD_REFUNDED",
      },
    };
  }

  async processRefund(id: string, dto: AdminRefundOrderDto, adminId?: string) {
    const order = await this.findOrderByIdOrNumber(id);

    const refundAmount = dto.amount ?? order.grandTotal;

    if (refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }

    if (refundAmount > order.grandTotal) {
      throw new BadRequestException(
        `Refund amount (₹${refundAmount}) cannot exceed order total (₹${order.grandTotal})`,
      );
    }

    const returnRecord = await this.prisma.orderReturn.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    const paymentRecord = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Update any open returns on this order to completed/refunded
      await tx.orderReturn.updateMany({
        where: { orderId: order.id, status: 'INITIATED' },
        data: { status: 'REFUNDED' },
      });

      // 2. If full refund and payment was completed, note refund status
      if (refundAmount === order.grandTotal) {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: PaymentStatusEnum.COMPLETED },
          data: { failureReason: `Refunded: ${dto.reason}` },
        });
      }

      // 3. Create persistent RefundAudit record in REFUND_INITIATED state
      await tx.refundAudit.create({
        data: {
          orderId: order.id,
          orderReturnId: returnRecord?.id || null,
          userId: order.userId,
          paymentId: paymentRecord?.id || null,
          amount: refundAmount,
          currency: 'INR',
          refundMethod: dto.refundMethod || (order.paymentMethod === 'COD' ? 'COD' : 'ORIGINAL_PAYMENT'),
          status: 'REFUND_INITIATED',
          provider: order.paymentMethod === 'COD' ? 'MANUAL' : 'RAZORPAY',
          actorType: adminId ? 'ADMIN' : 'SYSTEM',
          initiatedByAdminId: adminId || null,
          initiatedAt: new Date(),
          idempotencyKey: `admin_refund_${order.id}_${Date.now()}`,
        },
      });
    });

    this.notificationsService.notifyRefundStatus({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: "ONLINE_REFUND_INITIATED",
      refundAmount,
    });

    return {
      success: true,
      message: 'Refund processed successfully',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        refundAmount: Number(refundAmount.toFixed(2)),
        currency: 'INR',
        reason: dto.reason,
        refundMethod: dto.refundMethod || 'ORIGINAL_PAYMENT',
        notes: dto.notes || null,
        refundedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * GET /api/v1/admin/orders/:id/invoice
   * Generate tax invoice with compliant GST structure
   */

  /**
   * GET /api/v1/admin/orders/:id/invoice/pdf
   * Generate downloadable PDF invoice
   */
  async getOrderRefundHistory(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

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
        orderReturnId: a.orderReturnId,
        amount: a.amount,
        currency: a.currency,
        refundMethod: a.refundMethod,
        status: a.status,
        provider: a.provider,
        providerRefundId: a.providerRefundId,
        transactionReference: a.transactionReference,
        actorType: a.actorType,
        initiatedByAdminId: a.initiatedByAdminId,
        confirmedByAdminId: a.confirmedByAdminId,
        initiatedAt: a.initiatedAt,
        completedAt: a.completedAt,
        failedAt: a.failedAt,
        failureReason: a.failureReason,
        failureCode: a.failureCode,
        createdAt: a.createdAt,
      })),
    };
  }

  async getOrderInvoicePdf(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

    let supportEmail = 'support@kickat.in';
    let supportPhone = '+91 98765 43210';
    let gstNumber: string | null = null;

    try {
      const generalSetting = await this.prisma.systemSetting.findFirst({ where: { group: 'general' } });
      if (generalSetting?.value && typeof generalSetting.value === 'object') {
        const val: any = generalSetting.value;
        if (val.supportEmail) supportEmail = val.supportEmail;
        if (val.supportPhone) supportPhone = val.supportPhone;
      }
      const taxSetting = await this.prisma.systemSetting.findFirst({ where: { group: 'tax' } });
      if (taxSetting?.value && typeof taxSetting.value === 'object') {
        const val: any = taxSetting.value;
        if (val.gstNumber) gstNumber = val.gstNumber;
      }
    } catch {
      // Graceful default settings fallback
    }

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
        supportEmail,
        supportPhone,
        gstNumber,
      },
    });

    return { buffer, orderNumber: order.orderNumber };
  }

  async getOrderInvoice(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

    const taxSettings = this.settingsService ? await this.settingsService.getTaxSettingsRaw() : null;
    const defaultGstPercentage = taxSettings?.gstEnabled ? Number(taxSettings.gstPercentage ?? 0) : 0;
    const gstPercentage = order.gstPercentage ?? (order.gstAmount && order.subtotal ? Math.round((order.gstAmount / order.subtotal) * 100) : defaultGstPercentage);
    const taxRate = gstPercentage / 100;
    const taxAmount = order.gstAmount ?? Number((order.subtotal * taxRate).toFixed(2));
    const cgst = Number((taxAmount / 2).toFixed(2));
    const sgst = Number((taxAmount / 2).toFixed(2));

    const invoiceItems = order.items.map((item) => {
      const itemTax = Number((item.totalPrice * taxRate).toFixed(2));
      return {
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.totalPrice,
        taxRate: `${gstPercentage}%`,
        taxAmount: itemTax,
      };
    });

    return {
      success: true,
      data: {
        invoiceNumber: `INV-${order.orderNumber}`,
        invoiceDate: order.createdAt,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: {
          id: order.user?.id || order.userId,
          name: order.user?.name || 'Customer',
          email: order.user?.email || null,
          phone: order.user?.phone || null,
        },
        billingAddress: order.address,
        shippingAddress: order.address,
        items: invoiceItems,
        summary: {
          subtotal: order.subtotal,
          taxBreakdown: {
            cgst,
            sgst,
            totalTax: taxAmount,
          },
          deliveryFee: order.deliveryFee,
          grandTotal: order.grandTotal,
        },
        payment: {
          method: order.paymentMethod,
          status: order.paymentStatus,
        },
        downloadUrl: `/api/v1/admin/orders/${order.id}/invoice/pdf`,
      },
    };
  }

  /**
   * GET /api/v1/admin/orders/:id/packing-slip
   * Generate warehouse packing slip for fulfillment
   */
  async getPackingSlip(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

    const totalUnits = order.items.reduce((sum, i) => sum + i.quantity, 0);

    const packageItems = order.items.map((item, index) => ({
      itemNumber: index + 1,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName || 'Standard',
      quantity: item.quantity,
      picked: false,
    }));

    return {
      success: true,
      data: {
        slipNumber: `PACK-${order.orderNumber}`,
        orderNumber: order.orderNumber,
        orderDate: order.createdAt,
        customer: {
          name: order.user?.name || 'Customer',
          phone: order.user?.phone || null,
        },
        shippingAddress: order.address,
        deliverySlot: order.deliverySlot || 'Standard Delivery',
        deliveryInstructions: order.deliveryInstructions || null,
        courierPartner: order.courierPartner || 'Assigned on Dispatch',
        trackingNumber: order.trackingNumber || 'Pending',
        packageItems,
        totalItemsCount: order.items.length,
        totalUnitsCount: totalUnits,
        barcode: order.orderNumber,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
