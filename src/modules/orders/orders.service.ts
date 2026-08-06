import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GetOrdersQueryDto, OrderStatusQueryEnum, OrderTypeQueryEnum } from './dto/get-orders-query.dto';
import { GetReturnsQueryDto } from './dto/get-returns-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ReturnOrderDto } from './dto/return-order.dto';
import { OrderStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, paramName: string = 'id'): string {
    if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(
        `${paramName} must be a valid UUID v4`,
      );
    }
    return id;
  }

  private async findOrderAndVerifyOwnership(userId: string, orderId: string) {
    this.validateUuid(orderId, 'id');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
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
        where.orderStatus = {
          in: [
            OrderStatusEnum.PENDING,
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

    return {
      success: true,
      orders,
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
    const order = await this.findOrderAndVerifyOwnership(userId, id);
    return {
      success: true,
      order,
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

  /**
   * GET /orders/:id/tracking
   */
  async getOrderTracking(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    return {
      success: true,
      orderId: order.id,
      trackingNumber: order.trackingNumber || `TRK-${order.orderNumber}`,
      courierPartner: order.courierPartner || 'Kickat Express Delivery',
      status: order.orderStatus,
      estimatedDelivery:
        order.estimatedDelivery ||
        order.deliveryDate ||
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      history: [
        {
          location: 'Hub Facility',
          status: 'Order Prepared',
          timestamp: order.createdAt,
        },
        {
          location: 'Logistics Center',
          status: order.orderStatus,
          timestamp: order.updatedAt,
        },
      ],
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
  async getOrderInvoice(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    const taxAmount = Math.round(order.subtotal * 0.18 * 100) / 100;

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
          taxAmount,
          deliveryFee: order.deliveryFee,
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

    const nonCancellableStatuses: OrderStatusEnum[] = [
      OrderStatusEnum.PACKED,
      OrderStatusEnum.SHIPPED,
      OrderStatusEnum.OUT_FOR_DELIVERY,
      OrderStatusEnum.DELIVERED,
      OrderStatusEnum.CANCELLED,
      OrderStatusEnum.RETURNED,
    ];

    if (nonCancellableStatuses.includes(order.orderStatus)) {
      throw new ConflictException(
        'Order already packed, shipped, delivered, or cancelled',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: OrderStatusEnum.CANCELLED,
        cancelReason: dto.reason,
        cancelReasonOther: dto.reasonOther,
        cancelledAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Order cancelled successfully',
      orderId: updatedOrder.id,
      status: updatedOrder.orderStatus,
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

    // Create return record in transaction
    const returnRecord = await this.prisma.$transaction(async (tx) => {
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

      await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: OrderStatusEnum.RETURN_INITIATED,
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
   * POST /orders/:id/reorder
   */
  async reorder(userId: string, id: string) {
    const order = await this.findOrderAndVerifyOwnership(userId, id);

    if (!order.items || order.items.length === 0) {
      throw new BadRequestException('Order has no items to reorder');
    }

    // Check stock / active products
    for (const item of order.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product || product.stock < 1) {
        throw new ConflictException(
          `Product '${item.productName}' is out of stock or discontinued`,
        );
      }

      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });

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
            variantId: item.variantId ?? undefined as any,
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
