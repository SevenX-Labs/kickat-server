import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminShipmentSortEnum,
  AdminShipmentsQueryDto,
  AssignCourierDto,
  UpdateShipmentStatusDto,
} from './dto/admin-shipping.dto';
import { OrderStatusEnum } from '@prisma/client';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to find order by UUID, orderNumber, or trackingNumber
   */
  private async findOrderByAnyIdentifier(identifier: string) {
    const isUuid = UUID_V4_REGEX.test(identifier);

    const order = await this.prisma.order.findFirst({
      where: isUuid
        ? { id: identifier }
        : {
            OR: [
              { orderNumber: identifier },
              { trackingNumber: identifier },
            ],
          },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        address: true,
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Shipment / Order not found');
    }

    return order;
  }

  /**
   * Generates tracking URL based on courier partner and AWB
   */
  private getCourierTrackingUrl(courier: string | null, awb: string | null): string {
    if (!awb) return '';
    const c = (courier || '').toLowerCase();
    if (c.includes('delhivery')) {
      return `https://www.delhivery.com/track/package/${awb}`;
    }
    if (c.includes('shiprocket')) {
      return `https://shiprocket.co/tracking/${awb}`;
    }
    if (c.includes('bluedart') || c.includes('blue dart')) {
      return `https://www.bluedart.com/tracking`;
    }
    if (c.includes('dtdc')) {
      return `https://www.dtdc.in/tracking.asp`;
    }
    return `https://track.kickat.in/shipment/${awb}`;
  }

  /**
   * GET /api/v1/admin/shipments
   * List all shipments with filtering, search, and KPI counters
   */
  async getShipments(query: AdminShipmentsQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.orderStatus = query.status;
    }

    if (query.courier) {
      where.courierPartner = { contains: query.courier.trim(), mode: 'insensitive' };
    }

    if (query.awbNumber) {
      where.trackingNumber = { contains: query.awbNumber.trim(), mode: 'insensitive' };
    }

    if (query.orderNumber) {
      where.orderNumber = { contains: query.orderNumber.trim(), mode: 'insensitive' };
    }

    if (query.isRTO !== undefined) {
      if (query.isRTO) {
        where.orderStatus = {
          in: [OrderStatusEnum.RETURN_INITIATED, OrderStatusEnum.RETURNED],
        };
      } else {
        where.orderStatus = {
          notIn: [OrderStatusEnum.RETURN_INITIATED, OrderStatusEnum.RETURNED],
        };
      }
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { trackingNumber: { contains: s, mode: 'insensitive' } },
        { courierPartner: { contains: s, mode: 'insensitive' } },
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { phone: { contains: s, mode: 'insensitive' } } },
        { address: { city: { contains: s, mode: 'insensitive' } } },
        { address: { pincode: { contains: s, mode: 'insensitive' } } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminShipmentSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminShipmentSortEnum.ESTIMATED_DELIVERY_ASC:
        orderBy = { estimatedDelivery: 'asc' };
        break;
      case AdminShipmentSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [
      orders,
      total,
      pendingAssignmentCount,
      inTransitCount,
      deliveredCount,
      rtoCount,
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
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.PROCESSING, OrderStatusEnum.PACKED] },
          trackingNumber: null,
        },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.SHIPPED, OrderStatusEnum.OUT_FOR_DELIVERY] },
        },
      }),
      this.prisma.order.count({
        where: { ...where, orderStatus: OrderStatusEnum.DELIVERED },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.RETURN_INITIATED, OrderStatusEnum.RETURNED] },
        },
      }),
    ]);

    const formattedShipments = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity}`)
        .join(', ');
      const isRTO =
        order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
        order.orderStatus === OrderStatusEnum.RETURNED;

      return {
        id: order.id,
        shipmentNumber: `SHIP-${order.orderNumber}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: {
          id: order.user?.id || order.userId,
          name: order.user?.name || 'Customer',
          email: order.user?.email || null,
          phone: order.user?.phone || null,
        },
        destination: {
          city: order.address?.city || null,
          state: order.address?.state || null,
          pincode: order.address?.pincode || null,
          fullAddress: `${order.address?.houseFlat || ''} ${order.address?.buildingStreet || ''}, ${order.address?.city || ''} - ${order.address?.pincode || ''}`.trim(),
        },
        courierPartner: order.courierPartner || 'Unassigned',
        awbNumber: order.trackingNumber || null,
        status: order.orderStatus,
        isRTO,
        itemsCount,
        itemsSummary,
        estimatedDelivery: order.estimatedDelivery || order.deliveryDate || null,
        trackingUrl: this.getCourierTrackingUrl(order.courierPartner, order.trackingNumber),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        shipments: formattedShipments,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalShipments: total,
          pendingAssignmentCount,
          inTransitCount,
          deliveredCount,
          rtoCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/shipments/:id
   * Get single shipment details
   */
  async getShipmentById(id: string) {
    const order = await this.findOrderByAnyIdentifier(id);

    const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
    const isRTO =
      order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
      order.orderStatus === OrderStatusEnum.RETURNED;

    return {
      success: true,
      data: {
        id: order.id,
        shipmentNumber: `SHIP-${order.orderNumber}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        courierPartner: order.courierPartner || 'Unassigned',
        awbNumber: order.trackingNumber || null,
        status: order.orderStatus,
        isRTO,
        trackingUrl: this.getCourierTrackingUrl(order.courierPartner, order.trackingNumber),
        customer: order.user,
        shippingAddress: order.address,
        itemsCount,
        packageItems: order.items,
        deliverySlot: order.deliverySlot || 'Standard Delivery',
        deliveryInstructions: order.deliveryInstructions || null,
        estimatedDelivery: order.estimatedDelivery || order.deliveryDate || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    };
  }

  /**
   * POST /api/v1/admin/shipments/:id/assign
   * Assign courier partner and generate AWB number
   */
  async assignCourier(id: string, dto: AssignCourierDto) {
    const order = await this.findOrderByAnyIdentifier(id);

    const courierCode = dto.courierPartner.substring(0, 3).toUpperCase();
    const generatedAwb = `AWB-${courierCode}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalAwb = dto.awbNumber ? dto.awbNumber.trim() : generatedAwb;

    const estimatedDate = dto.estimatedDelivery
      ? new Date(dto.estimatedDelivery)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days default

    // If order was in PLACED or PROCESSING, advance to SHIPPED (or keep PACKED/SHIPPED)
    const nextStatus =
      order.orderStatus === OrderStatusEnum.PENDING ||
      order.orderStatus === OrderStatusEnum.PLACED ||
      order.orderStatus === OrderStatusEnum.PROCESSING ||
      order.orderStatus === OrderStatusEnum.PACKED
        ? OrderStatusEnum.SHIPPED
        : order.orderStatus;

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        courierPartner: dto.courierPartner.trim(),
        trackingNumber: finalAwb,
        estimatedDelivery: estimatedDate,
        orderStatus: nextStatus,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        address: true,
      },
    });

    return {
      success: true,
      message: `Courier ${dto.courierPartner} and AWB ${finalAwb} assigned successfully`,
      data: {
        shipmentNumber: `SHIP-${updated.orderNumber}`,
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        courierPartner: updated.courierPartner,
        awbNumber: updated.trackingNumber,
        estimatedDelivery: updated.estimatedDelivery,
        status: updated.orderStatus,
        trackingUrl: this.getCourierTrackingUrl(updated.courierPartner, updated.trackingNumber),
        pickupLocation: dto.pickupLocation || 'Kickat Central Warehouse, Mumbai',
        assignedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * PATCH /api/v1/admin/shipments/:id/status
   * Update shipment delivery status
   */
  async updateShipmentStatus(id: string, dto: UpdateShipmentStatusDto) {
    const order = await this.findOrderByAnyIdentifier(id);

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: dto.status,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const isRTO =
      dto.status === OrderStatusEnum.RETURN_INITIATED ||
      dto.status === OrderStatusEnum.RETURNED;

    return {
      success: true,
      message: `Shipment status updated to ${dto.status}`,
      data: {
        shipmentNumber: `SHIP-${updated.orderNumber}`,
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.orderStatus,
        isRTO,
        courierPartner: updated.courierPartner,
        awbNumber: updated.trackingNumber,
        location: dto.location || null,
        notes: dto.notes || null,
        updatedAt: updated.updatedAt,
      },
    };
  }

  /**
   * GET /api/v1/admin/shipments/:id/tracking
   * Live tracking timeline with checkpoints and courier portal URL
   */
  async getShipmentTracking(id: string) {
    const order = await this.findOrderByAnyIdentifier(id);

    const awb = order.trackingNumber || `TRK-${order.orderNumber}`;
    const courier = order.courierPartner || 'Kickat Express';
    const isRTO =
      order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
      order.orderStatus === OrderStatusEnum.RETURNED;

    const baseCreated = new Date(order.createdAt).getTime();

    // Generate chronological checkpoints based on orderStatus
    const statusOrder: OrderStatusEnum[] = [
      OrderStatusEnum.PLACED,
      OrderStatusEnum.PROCESSING,
      OrderStatusEnum.PACKED,
      OrderStatusEnum.SHIPPED,
      OrderStatusEnum.OUT_FOR_DELIVERY,
      OrderStatusEnum.DELIVERED,
    ];

    const currentStatusIndex = statusOrder.indexOf(order.orderStatus);

    const checkpoints = [
      {
        stage: 'ORDER_PLACED',
        title: 'Order Placed & Confirmed',
        location: 'Online Platform',
        timestamp: new Date(baseCreated).toISOString(),
        isCompleted: true,
        description: 'Customer order placed and payment verified.',
      },
      {
        stage: 'PACKED',
        title: 'Packed at Warehouse',
        location: 'Kickat Central Hub, Mumbai',
        timestamp: new Date(baseCreated + 1 * 60 * 60 * 1000).toISOString(),
        isCompleted: currentStatusIndex >= 2 || isRTO,
        description: 'Items picked, verified, and safely packed.',
      },
      {
        stage: 'SHIPPED',
        title: 'Handed Over to Courier',
        location: 'Mumbai Logistics Hub',
        timestamp: new Date(baseCreated + 4 * 60 * 60 * 1000).toISOString(),
        isCompleted: currentStatusIndex >= 3 || isRTO,
        description: `Package picked up by ${courier} under AWB ${awb}.`,
      },
      {
        stage: 'IN_TRANSIT',
        title: 'In Transit to Destination Hub',
        location: `${order.address?.city || 'Destination'} Regional Sorting Facility`,
        timestamp: new Date(baseCreated + 24 * 60 * 60 * 1000).toISOString(),
        isCompleted: currentStatusIndex >= 3 || isRTO,
        description: 'Package in transit between logistics hubs.',
      },
      {
        stage: 'OUT_FOR_DELIVERY',
        title: 'Out for Delivery',
        location: `${order.address?.city || 'Local'} Delivery Center`,
        timestamp: new Date(baseCreated + 36 * 60 * 60 * 1000).toISOString(),
        isCompleted: currentStatusIndex >= 4,
        description: 'Delivery executive assigned and out for delivery.',
      },
      {
        stage: isRTO ? 'RTO_INITIATED' : 'DELIVERED',
        title: isRTO ? 'Return to Origin (RTO)' : 'Delivered to Recipient',
        location: `${order.address?.city || ''}, ${order.address?.state || ''}`,
        timestamp: new Date(baseCreated + 48 * 60 * 60 * 1000).toISOString(),
        isCompleted:
          order.orderStatus === OrderStatusEnum.DELIVERED ||
          order.orderStatus === OrderStatusEnum.RETURNED,
        description: isRTO
          ? 'Shipment marked for Return to Origin.'
          : 'Package safely delivered to recipient address.',
      },
    ];

    return {
      success: true,
      data: {
        shipmentNumber: `SHIP-${order.orderNumber}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        awbNumber: awb,
        courierPartner: courier,
        currentStatus: order.orderStatus,
        isRTO,
        origin: 'Kickat Central Warehouse, Mumbai, Maharashtra',
        destination: `${order.address?.city || 'Destination'}, ${order.address?.state || ''} - ${order.address?.pincode || ''}`,
        estimatedDelivery:
          order.estimatedDelivery ||
          order.deliveryDate ||
          new Date(baseCreated + 3 * 24 * 60 * 60 * 1000).toISOString(),
        trackingUrl: this.getCourierTrackingUrl(courier, awb),
        timeline: checkpoints,
      },
    };
  }
}
