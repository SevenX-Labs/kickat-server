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
import { ReorderDto, ReorderItemDto } from './dto/reorder.dto';
import { OrderAgainQueryDto } from './dto/order-again-query.dto';
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
      OrderStatusEnum.RETURN_INITIATED,
    ];

    if (nonCancellableStatuses.includes(order.orderStatus)) {
      throw new ConflictException(
        'Order already packed, shipped, delivered, or cancelled',
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const updateRes = await tx.order.updateMany({
        where: {
          id: order.id,
          userId,
          orderStatus: { notIn: nonCancellableStatuses },
        },
        data: {
          orderStatus: OrderStatusEnum.CANCELLED,
          cancelReason: dto.reason,
          cancelReasonOther: dto.reasonOther,
          cancelledAt: new Date(),
        },
      });

      if (updateRes.count === 0) {
        throw new ConflictException(
          'Order already packed, shipped, delivered, or cancelled',
        );
      }

      // Atomically restore deducted stock for all order items
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return {
        id: order.id,
        orderStatus: OrderStatusEnum.CANCELLED,
      };
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
    const pagedProductIds = Array.from(new Set(pagedEntries.map((e) => e.productId)));
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

    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));
    const variantMap = new Map<string, any>(variants.map((v: any) => [v.id, v]));

    const items = pagedEntries.map((entry) => {
      const product = productMap.get(entry.productId) || null;
      const variant = entry.variantId ? variantMap.get(entry.variantId) || null : null;

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
        ? this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve<any[]>([]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map<string, any>((variants as any[]).map((v) => [v.id, v]));

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
        ? this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve<any[]>([]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map<string, any>((variants as any[]).map((v) => [v.id, v]));

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
