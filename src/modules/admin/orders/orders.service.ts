import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminCancelOrderDto,
  AdminOrderSortEnum,
  AdminOrdersQueryDto,
  AdminRefundOrderDto,
  UpdateOrderStatusDto,
} from './dto/admin-order.dto';
import { OrderStatusEnum, PaymentStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to find order by UUID or orderNumber
   */
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

    return {
      success: true,
      data: {
        ...order,
        itemsCount,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/orders/:id/status
   * Advance or update order lifecycle status
   */
  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrderByIdOrNumber(id);

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: dto.status,
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
  async cancelOrder(id: string, dto: AdminCancelOrderDto) {
    const order = await this.findOrderByIdOrNumber(id);

    if (order.orderStatus === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // 1. Restock items if requested
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

      // 2. Mark order as CANCELLED
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: OrderStatusEnum.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelReasonOther: dto.reasonOther || null,
        },
        include: {
          items: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return updated;
    });

    return {
      success: true,
      message: 'Order cancelled successfully and inventory restocked',
      data: updatedOrder,
    };
  }

  /**
   * POST /api/v1/admin/orders/:id/refund
   * Process full or partial refund
   */
  async processRefund(id: string, dto: AdminRefundOrderDto) {
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
  async getOrderInvoice(id: string) {
    const order = await this.findOrderByIdOrNumber(id);

    const taxRate = 0.18; // 18% GST standard
    const taxAmount = Number((order.subtotal * taxRate).toFixed(2));
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
        taxRate: '18%',
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
