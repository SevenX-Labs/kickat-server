import { NotificationsService } from '../../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { NullShippingProvider } from './providers/null-shipping.provider';
import { ShiprocketProvider } from './providers/shiprocket.provider';
import {
  CreateShipmentPackageDetails,
  CreateShipmentParams,
  ShippingProvider,
} from './providers/shipping-provider.interface';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  private shippingProvider: ShippingProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly nullShippingProvider: NullShippingProvider,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly shiprocketProvider?: ShiprocketProvider,
  ) {
    const configuredProvider = (
      this.configService.get<string>('SHIPPING_PROVIDER', '') || ''
    ).toUpperCase();

    if (configuredProvider === 'SHIPROCKET' && this.shiprocketProvider) {
      this.shippingProvider = this.shiprocketProvider;
      this.logger.log('Active shipping provider initialized: SHIPROCKET');
    } else {
      this.shippingProvider = this.nullShippingProvider;
      this.logger.log(
        'Active shipping provider initialized: NULL (UNCONFIGURED)',
      );
    }
  }

  getShippingProvider(): ShippingProvider {
    return this.shippingProvider;
  }

  /**
   * Helper to find order by UUID, orderNumber, or trackingNumber
   */
  private async findOrderByAnyIdentifier(identifier: string) {
    const isUuid = UUID_V4_REGEX.test(identifier);

    const order = await this.prisma.order.findFirst({
      where: isUuid
        ? { id: identifier }
        : {
            OR: [{ orderNumber: identifier }, { trackingNumber: identifier }],
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
      where.courierPartner = {
        contains: query.courier.trim(),
        mode: 'insensitive',
      };
    }

    if (query.awbNumber) {
      where.trackingNumber = {
        contains: query.awbNumber.trim(),
        mode: 'insensitive',
      };
    }

    if (query.orderNumber) {
      where.orderNumber = {
        contains: query.orderNumber.trim(),
        mode: 'insensitive',
      };
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
      shippedCount,
      outForDeliveryCount,
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
          orderStatus: {
            in: [
              OrderStatusEnum.PLACED,
              OrderStatusEnum.PROCESSING,
              OrderStatusEnum.PACKED,
            ],
          },
          trackingNumber: null,
        },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: OrderStatusEnum.SHIPPED,
        },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: OrderStatusEnum.OUT_FOR_DELIVERY,
        },
      }),
      this.prisma.order.count({
        where: { ...where, orderStatus: OrderStatusEnum.DELIVERED },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: {
            in: [OrderStatusEnum.RETURN_INITIATED, OrderStatusEnum.RETURNED],
          },
        },
      }),
    ]);

    const formattedShipments = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map(
          (i) =>
            `${i.productName}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity}`,
        )
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
          city: order.address?.city || null,
          pincode: order.address?.pincode || null,
        },
        destination: {
          city: order.address?.city || null,
          state: order.address?.state || null,
          pincode: order.address?.pincode || null,
          fullAddress:
            `${order.address?.houseFlat || ''} ${order.address?.buildingStreet || ''}, ${order.address?.city || ''} - ${order.address?.pincode || ''}`.trim(),
        },
        courierPartner: order.courierPartner || 'Unassigned',
        awbNumber: order.trackingNumber || null,
        status: order.orderStatus,
        isRTO,
        itemsCount,
        itemsSummary,
        estimatedDelivery:
          order.estimatedDelivery || order.deliveryDate || null,
        trackingUrl: this.getCourierTrackingUrl(
          order.courierPartner,
          order.trackingNumber,
        ),
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
          pendingPickup: pendingAssignmentCount,
          pendingAssignmentCount,
          shippedCount,
          outForDeliveryCount,
          inTransitCount: shippedCount + outForDeliveryCount,
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
        trackingUrl: this.getCourierTrackingUrl(
          order.courierPartner,
          order.trackingNumber,
        ),
        customer: order.user,
        shippingAddress: order.address,
        itemsCount,
        packageItems: order.items,
        deliverySlot: order.deliverySlot || 'Standard Delivery',
        deliveryInstructions: order.deliveryInstructions || null,
        estimatedDelivery:
          order.estimatedDelivery || order.deliveryDate || null,
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

    this.notificationsService.notifyOrderStatusChange({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      userId: updated.userId,
      oldStatus: order.orderStatus,
      newStatus: updated.orderStatus,
      trackingNumber: updated.trackingNumber,
      courierPartner: updated.courierPartner,
      estimatedDelivery: updated.estimatedDelivery,
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
        orderStatus: updated.orderStatus,
        status: updated.orderStatus,
        trackingUrl: this.getCourierTrackingUrl(
          updated.courierPartner,
          updated.trackingNumber,
        ),
        pickupLocation:
          dto.pickupLocation || 'Kickat Central Warehouse, Mumbai',
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

    this.notificationsService.notifyOrderStatusChange({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      userId: updated.userId,
      oldStatus: order.orderStatus,
      newStatus: updated.orderStatus,
      trackingNumber: updated.trackingNumber,
      courierPartner: updated.courierPartner,
      estimatedDelivery: updated.estimatedDelivery,
    });

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

    const specCheckpoints = checkpoints
      .filter((c) => c.isCompleted)
      .map((c) => ({
        status: c.stage,
        location: c.location,
        timestamp: c.timestamp,
      }));

    return {
      success: true,
      data: {
        id: order.id,
        orderId: order.id,
        shipmentNumber: `SHIP-${order.orderNumber}`,
        orderNumber: order.orderNumber,
        awbNumber: awb,
        courierPartner: courier,
        status: order.orderStatus,
        currentStatus: order.orderStatus,
        isRTO,
        origin: 'Kickat Central Warehouse, Mumbai, Maharashtra',
        destination: `${order.address?.city || 'Destination'}, ${order.address?.state || ''} - ${order.address?.pincode || ''}`,
        estimatedDelivery:
          order.estimatedDelivery ||
          order.deliveryDate ||
          new Date(baseCreated + 3 * 24 * 60 * 60 * 1000).toISOString(),
        trackingUrl: this.getCourierTrackingUrl(courier, awb),
        checkpoints: specCheckpoints,
        timeline: checkpoints,
      },
    };
  }

  /**
   * Helper to parse weight strings/numbers into kg.
   * Handles "1.5kg", "500g", "250 gm", "2 kgs", "500 grams", etc.
   */
  private parseWeightStringToKg(value: unknown): number | null {
    if (typeof value === "number") {
      if (isNaN(value) || value <= 0) return null;
      if (value > 50) {
        return Math.round((value / 1000) * 1000) / 1000;
      }
      return value;
    }

    if (typeof value !== "string") return null;

    const str = value.trim().toLowerCase();
    if (!str) return null;

    const unitMatch = str.match(
      /(?:^|\s|\()(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams)\b/i,
    );
    if (unitMatch) {
      const num = parseFloat(unitMatch[1]);
      if (isNaN(num) || num <= 0) return null;
      const unit = unitMatch[2].toLowerCase();
      if (["g", "gm", "gms", "gram", "grams"].includes(unit)) {
        return Math.round((num / 1000) * 1000) / 1000;
      }
      return num;
    }

    const pureNumMatch = str.match(/^(\d+(?:\.\d+)?)$/);
    if (pureNumMatch) {
      const num = parseFloat(pureNumMatch[1]);
      if (isNaN(num) || num <= 0) return null;
      if (num > 50) {
        return Math.round((num / 1000) * 1000) / 1000;
      }
      return num;
    }

    return null;
  }

  /**
   * Calculates total shipment weight in kg from order items and persisted product/variant data.
   * Multiplies each item unit weight by quantity.
   * If any item weight cannot be reliably resolved, returns null.
   */
  private async calculateOrderWeight(
    items: Array<{
      productId: string;
      variantId?: string | null;
      quantity: number;
      productName: string;
      variantName?: string | null;
    }>,
  ): Promise<number | null> {
    if (!items || items.length === 0) return null;

    const productIds = Array.from(
      new Set(items.map((i) => i.productId).filter(Boolean)),
    );

    let productMap = new Map<string, any>();
    if (productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          attributes: true,
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              attributes: true,
            },
          },
        },
      });
      productMap = new Map(products.map((p) => [p.id, p]));
    }

    let totalKg = 0;

    for (const item of items) {
      const quantity = item.quantity || 1;
      let unitWeightKg: number | null = null;

      const product = productMap.get(item.productId);
      if (product) {
        if (item.variantId && Array.isArray(product.variants)) {
          const variant = product.variants.find(
            (v: any) => v.id === item.variantId,
          );
          if (variant) {
            unitWeightKg = this.parseWeightStringToKg(
              (variant.attributes as any)?.weight,
            );
            if (unitWeightKg === null) {
              unitWeightKg = this.parseWeightStringToKg(variant.name);
            }
          }
        }
        if (unitWeightKg === null && item.variantName) {
          unitWeightKg = this.parseWeightStringToKg(item.variantName);
        }
        if (unitWeightKg === null && product.attributes) {
          unitWeightKg = this.parseWeightStringToKg(
            (product.attributes as any)?.weight,
          );
        }
      }

      if (unitWeightKg === null && item.variantName) {
        unitWeightKg = this.parseWeightStringToKg(item.variantName);
      }

      if (unitWeightKg === null && item.productName) {
        unitWeightKg = this.parseWeightStringToKg(item.productName);
      }

      if (unitWeightKg === null || unitWeightKg <= 0) {
        this.logger.warn(
          `Unable to resolve reliable weight for order item: "${item.productName}" (variant: "${item.variantName || ""}").`,
        );
        return null;
      }

      totalKg += unitWeightKg * quantity;
    }

    return Math.round(totalKg * 1000) / 1000;
  }

  /**
   * Creates a forward shipment for an order via the active shipping provider (e.g. Shiprocket)
   * Validates all required data before invoking provider and enforces idempotency.
   */
  async createShipmentForOrder(
    orderIdentifier: string,
    options?: {
      pickupLocation?: string;
      packageDetails?: CreateShipmentPackageDetails;
    },
  ) {
    const order = await this.findOrderByAnyIdentifier(orderIdentifier);

    // 1. Idempotency check: prevent duplicate shipment creation if already persisted
    if (order.shiprocketShipmentId) {
      this.logger.log(
        `Shipment already exists for order ${order.orderNumber} (shiprocketShipmentId: ${order.shiprocketShipmentId}). Skipping remote creation.`,
      );
      return {
        success: true,
        message: "Shipment already exists for this order",
        isExisting: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shiprocketOrderId: order.shiprocketOrderId,
          shiprocketShipmentId: order.shiprocketShipmentId,
          courierPartner: order.courierPartner,
          trackingNumber: order.trackingNumber,
          status: order.orderStatus,
        },
      };
    }

    // 2. Customer validation (no fake fallback)
    const customerEmail = (order.user?.email || "").trim();
    if (!customerEmail || !EMAIL_REGEX.test(customerEmail)) {
      throw new BadRequestException(
        "Valid customer email is required for Shiprocket shipment creation.",
      );
    }

    const customerName = (order.user?.name || "").trim();
    if (!customerName) {
      throw new BadRequestException(
        "Customer name is required before creating a Shiprocket shipment.",
      );
    }

    const customerPhone = (order.user?.phone || "").trim();
    if (!customerPhone) {
      throw new BadRequestException(
        "Customer phone number is required before creating a Shiprocket shipment.",
      );
    }

    // 3. Address validation
    if (!order.address) {
      throw new BadRequestException(
        "Order does not have a delivery address associated.",
      );
    }

    const houseFlat = order.address.houseFlat?.trim();
    const buildingStreet = order.address.buildingStreet?.trim();
    if (!houseFlat && !buildingStreet) {
      throw new BadRequestException(
        "Shipping address line is required for Shiprocket shipment creation.",
      );
    }

    const city = order.address.city?.trim();
    const state = order.address.state?.trim();
    const pincode = order.address.pincode?.trim();
    if (!city || !state || !pincode) {
      throw new BadRequestException(
        "Shipping city, state, and pincode are required for Shiprocket shipment creation.",
      );
    }

    // 4. Order items validation
    if (!order.items || order.items.length === 0) {
      throw new BadRequestException(
        "Order does not have any items associated.",
      );
    }

    // 5. Pickup location validation (no hardcoded fallback)
    const pickupLocation = (
      options?.pickupLocation ||
      this.configService.get<string>("SHIPROCKET_PICKUP_LOCATION", "") ||
      ""
    ).trim();

    if (!pickupLocation) {
      throw new BadRequestException(
        "Shiprocket pickup location is not configured.",
      );
    }

    // 6. Package weight validation & calculation (no silent 0.5 kg fallback)
    let totalWeight: number | null = null;
    if (options?.packageDetails?.weight !== undefined) {
      if (
        typeof options.packageDetails.weight !== "number" ||
        isNaN(options.packageDetails.weight) ||
        options.packageDetails.weight <= 0
      ) {
        throw new BadRequestException(
          "Shipment weight is required before creating a Shiprocket shipment.",
        );
      }
      totalWeight = options.packageDetails.weight;
    } else {
      totalWeight = await this.calculateOrderWeight(order.items);
    }

    if (
      typeof totalWeight !== "number" ||
      isNaN(totalWeight) ||
      totalWeight <= 0
    ) {
      throw new BadRequestException(
        "Shipment weight is required before creating a Shiprocket shipment.",
      );
    }

    // 7. Package dimensions validation (no silent 10x10x10 fallback)
    let dimensions: { length?: number; breadth?: number; height?: number } = {};
    if (
      options?.packageDetails?.length !== undefined ||
      options?.packageDetails?.breadth !== undefined ||
      options?.packageDetails?.height !== undefined
    ) {
      const l = options.packageDetails.length;
      const b = options.packageDetails.breadth;
      const h = options.packageDetails.height;

      if (
        typeof l !== "number" ||
        typeof b !== "number" ||
        typeof h !== "number" ||
        l <= 0 ||
        b <= 0 ||
        h <= 0
      ) {
        throw new BadRequestException(
          "Package dimensions (length, breadth, height) must be positive numbers when provided.",
        );
      }
      dimensions = { length: l, breadth: b, height: h };
    }

    const shipmentParams: CreateShipmentParams = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      taxAmount: order.gstAmount || 0,
      grandTotal: order.grandTotal,
      pickupLocation,
      packageDetails: {
        weight: totalWeight,
        ...dimensions,
      },
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
      },
      shippingAddress: {
        name: customerName,
        phone: customerPhone,
        houseFlat: order.address.houseFlat,
        buildingStreet: order.address.buildingStreet,
        landmark: order.address.landmark,
        city,
        state,
        pincode,
        country: order.address.country || "India",
      },
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
      })),
    };

    const result = await this.shippingProvider.createShipment(shipmentParams);

    // Persist remote shipment details to Order record
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shippingProvider: result.providerName,
        shiprocketOrderId: result.orderId ? String(result.orderId) : null,
        shiprocketShipmentId: result.shipmentId
          ? String(result.shipmentId)
          : null,
        courierPartner:
          result.courierName || order.courierPartner || "Shiprocket",
        trackingNumber: result.awbCode || order.trackingNumber || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        address: true,
      },
    });

    return {
      success: true,
      message: "Forward shipment created successfully",
      isExisting: false,
      data: {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        shippingProvider: updated.shippingProvider,
        shiprocketOrderId: updated.shiprocketOrderId,
        shiprocketShipmentId: updated.shiprocketShipmentId,
        courierPartner: updated.courierPartner,
        trackingNumber: updated.trackingNumber,
        status: updated.orderStatus,
        remoteStatus: result.status,
      },
    };
  }
}
