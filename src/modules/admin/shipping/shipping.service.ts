import { OrderTrackingEventsService } from "./order-tracking-events.service";
import { NotificationsService } from '../../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { NullShippingProvider } from './providers/null-shipping.provider';
import { EkartProvider } from './providers/ekart.provider';
import {
  AssignAwbResult,
  AvailableCourier,
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
import {
  buildTrackingTimeline,
  serializeTrackingEvents,
} from './tracking-events.util';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly activeShipmentLocks = new Set<string>();

  private shippingProvider: ShippingProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly nullShippingProvider: NullShippingProvider,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly ekartProvider?: EkartProvider,
    @Optional() private readonly trackingEventsService?: OrderTrackingEventsService,
  ) {
    if (this.ekartProvider?.isConfigured()) {
      this.shippingProvider = this.ekartProvider;
      this.logger.log('Active shipping provider initialized: EKART');
    } else {
      this.shippingProvider = this.nullShippingProvider;
      this.logger.log(
        'Active shipping provider initialized: NULL (UNCONFIGURED — set EKART_CLIENT_ID, EKART_USERNAME, EKART_PASSWORD)',
      );
    }
  }

  getShippingProvider(): ShippingProvider {
    return this.shippingProvider;
  }

  /**
   * Resolves the configured warehouse pickup location name for the active shipping provider.
   */
  resolveConfiguredPickupLocation(explicitLocation?: string): string {
    if (explicitLocation && explicitLocation.trim()) {
      return explicitLocation.trim();
    }
    return (this.configService.get<string>("EKART_PICKUP_ALIAS", "") || "").trim();
  }

  /**
   * Resolves the configured warehouse pickup pincode for the active shipping provider.
   */
  resolveConfiguredPickupPincode(explicitPincode?: string): string {
    if (explicitPincode && explicitPincode.trim()) {
      return explicitPincode.trim();
    }
    return (this.configService.get<string>("EKART_PICKUP_PINCODE", "") || "").trim();
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
    return `https://app.elite.ekartlogistics.in/track/${awb}`;
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

    if (this.trackingEventsService) {
      await this.trackingEventsService.recordEvents(
        updated.id,
        [
          {
            rawStatus: "AWB_ASSIGNED",
            stage: "SHIPPED",
            description: `Assigned to ${dto.courierPartner} (AWB: ${finalAwb})`,
            location: dto.pickupLocation || "Kickat Central Warehouse, Mumbai",
            eventAt: new Date(),
          },
        ],
        {
          source: "ADMIN",
          awb: finalAwb,
          shipmentId: updated.shiprocketShipmentId,
        },
      ).catch(() => {});
    }

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

    if (this.trackingEventsService) {
      await this.trackingEventsService.recordEvents(
        updated.id,
        [
          {
            rawStatus: dto.status,
            stage: dto.status as any,
            description: dto.notes || `Shipment marked as ${dto.status} by merchant`,
            location: dto.location || null,
            eventAt: new Date(),
          },
        ],
        {
          source: "ADMIN",
          awb: updated.trackingNumber,
          shipmentId: updated.shiprocketShipmentId,
        },
      ).catch(() => {});
    }

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
    const courier = order.courierPartner || 'Ekart';
    const isRTO =
      order.orderStatus === OrderStatusEnum.RETURN_INITIATED ||
      order.orderStatus === OrderStatusEnum.RETURNED;

    const baseCreated = new Date(order.createdAt).getTime();

    // Real courier scans persisted from the provider (webhook + AWB sync). The
    // timeline is built from them when present; otherwise it is a status-only
    // milestone summary with no invented locations or timestamps.
    const storedEvents = await this.prisma.orderTrackingEvent.findMany({
      where: { orderId: order.id },
      orderBy: [{ eventAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        rawStatus: true,
        stage: true,
        description: true,
        location: true,
        eventAt: true,
        source: true,
      },
    });

    const checkpoints = buildTrackingTimeline(order, storedEvents);

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
        // Additive: real provider scan events, chronological.
        events: serializeTrackingEvents(storedEvents),
      },
    };
  }

  /**
   * Helper to parse weight strings/numbers into kg.
   * Handles "1.5kg", "500g", "250 gm", "2 kgs", "500 grams", etc.
   */
  private parseWeightStringToKg(value: unknown): number | null {
    if (typeof value === 'number') {
      if (isNaN(value) || value <= 0) return null;
      if (value > 50) {
        return Math.round((value / 1000) * 1000) / 1000;
      }
      return value;
    }

    if (typeof value !== 'string') return null;

    const str = value.trim().toLowerCase();
    if (!str) return null;

    const unitMatch = str.match(
      /(?:^|\s|\()(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams)\b/i,
    );
    if (unitMatch) {
      const num = parseFloat(unitMatch[1]);
      if (isNaN(num) || num <= 0) return null;
      const unit = unitMatch[2].toLowerCase();
      if (['g', 'gm', 'gms', 'gram', 'grams'].includes(unit)) {
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
  /**
   * Resolves order shipping package details (weight & dimensions) from structured product/variant fields
   * with fallback to legacy attributes for weight if structured field is not yet set.
   */
  private async resolveOrderShippingPackage(
    items: Array<{
      productId: string;
      variantId?: string | null;
      quantity: number;
      productName: string;
      variantName?: string | null;
    }>,
  ): Promise<{
    weight: number;
    volumetricWeight: number;
    chargeableWeight: number;
    length: number;
    breadth: number;
    height: number;
  } | null> {
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
          shippingWeightKg: true,
          shippingLengthCm: true,
          shippingBreadthCm: true,
          shippingHeightCm: true,
          attributes: true,
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              shippingWeightKg: true,
              shippingLengthCm: true,
              shippingBreadthCm: true,
              shippingHeightCm: true,
              attributes: true,
            },
          },
        },
      });
      productMap = new Map((products || []).map((p) => [p.id, p]));
    }

    let totalDeadWeightKg = 0;
    let totalVolumeCm3 = 0;
    const itemLengths: number[] = [];
    const itemBreadths: number[] = [];

    for (const item of items) {
      const quantity = item.quantity || 1;
      let unitWeightKg: number | null = null;
      let itemLength: number | null = null;
      let itemBreadth: number | null = null;
      let itemHeight: number | null = null;

      const product = productMap.get(item.productId);
      const isVariantItem = Boolean(item.variantId || item.variantName);

      if (isVariantItem) {
        if (product && item.variantId && Array.isArray(product.variants)) {
          const variant = product.variants.find(
            (v: any) => v.id === item.variantId,
          );
          if (variant) {
            if (
              typeof variant.shippingWeightKg === 'number' &&
              variant.shippingWeightKg > 0
            ) {
              unitWeightKg = variant.shippingWeightKg;
            }
            if (
              typeof variant.shippingLengthCm === 'number' &&
              variant.shippingLengthCm > 0
            ) {
              itemLength = variant.shippingLengthCm;
            }
            if (
              typeof variant.shippingBreadthCm === 'number' &&
              variant.shippingBreadthCm > 0
            ) {
              itemBreadth = variant.shippingBreadthCm;
            }
            if (
              typeof variant.shippingHeightCm === 'number' &&
              variant.shippingHeightCm > 0
            ) {
              itemHeight = variant.shippingHeightCm;
            }

            if (unitWeightKg === null) {
              unitWeightKg = this.parseWeightStringToKg(
                (variant.attributes as any)?.weight,
              );
              if (unitWeightKg === null) {
                unitWeightKg = this.parseWeightStringToKg(variant.name);
              }
            }
          }
        }

        if (unitWeightKg === null && item.variantName) {
          unitWeightKg = this.parseWeightStringToKg(item.variantName);
        }
      } else if (product) {
        if (
          typeof product.shippingWeightKg === 'number' &&
          product.shippingWeightKg > 0
        ) {
          unitWeightKg = product.shippingWeightKg;
        }
        if (
          typeof product.shippingLengthCm === 'number' &&
          product.shippingLengthCm > 0
        ) {
          itemLength = product.shippingLengthCm;
        }
        if (
          typeof product.shippingBreadthCm === 'number' &&
          product.shippingBreadthCm > 0
        ) {
          itemBreadth = product.shippingBreadthCm;
        }
        if (
          typeof product.shippingHeightCm === 'number' &&
          product.shippingHeightCm > 0
        ) {
          itemHeight = product.shippingHeightCm;
        }

        if (unitWeightKg === null && product.attributes) {
          unitWeightKg = this.parseWeightStringToKg(
            (product.attributes as any)?.weight,
          );
        }
        if (unitWeightKg === null && item.productName) {
          unitWeightKg = this.parseWeightStringToKg(item.productName);
        }
      }

      if (unitWeightKg === null || unitWeightKg <= 0) {
        this.logger.warn(
          `Unable to resolve reliable weight for order item: "${item.productName}" (variant: "${item.variantName || ''}")`,
        );
        return null;
      }

      totalDeadWeightKg += unitWeightKg * quantity;

      if (itemLength && itemLength > 0) itemLengths.push(itemLength);
      if (itemBreadth && itemBreadth > 0) itemBreadths.push(itemBreadth);
      if (itemLength && itemBreadth && itemHeight) {
        totalVolumeCm3 += itemLength * itemBreadth * itemHeight * quantity;
      }
    }

    const deadWeight = Math.round(totalDeadWeightKg * 1000) / 1000;

    // Compute bounding box dimensions for multi-item packing
    const length = itemLengths.length > 0 ? Math.max(...itemLengths) : 0;
    const breadth = itemBreadths.length > 0 ? Math.max(...itemBreadths) : 0;
    let height = 0;

    if (length > 0 && breadth > 0 && totalVolumeCm3 > 0) {
      height = Math.max(1, Math.ceil(totalVolumeCm3 / (length * breadth)));
    }

    // Volumetric weight: (L × B × H) / 5000
    let volumetricWeight = 0;
    if (length > 0 && breadth > 0 && height > 0) {
      volumetricWeight =
        Math.round(((length * breadth * height) / 5000) * 1000) / 1000;
    }

    const chargeableWeight = Math.max(deadWeight, volumetricWeight);

    return {
      weight: deadWeight,
      volumetricWeight,
      chargeableWeight,
      length: Math.max(length, length > 0 ? 1 : 0),
      breadth: Math.max(breadth, breadth > 0 ? 1 : 0),
      height: Math.max(height, height > 0 ? 1 : 0),
    };
  }

  async calculateOrderWeight(
    items: Array<{
      productId: string;
      variantId?: string | null;
      quantity: number;
      productName: string;
      variantName?: string | null;
    }>,
  ): Promise<number | null> {
    const res = await this.resolveOrderShippingPackage(items);
    return res ? res.weight : null;
  }

  /**
   * Creates a forward shipment for an order via the active shipping provider.
   * Validates all required data before invoking provider and enforces idempotency.
   */
  async createShipmentForOrder(
    orderIdentifier: string,
    options?: {
      pickupLocation?: string;
      pickupPostcode?: string;
      packageDetails?: CreateShipmentPackageDetails;
    },
  ) {
    const order = await this.findOrderByAnyIdentifier(orderIdentifier);

    // Concurrency lock to prevent duplicate concurrent executions on the same order
    if (this.activeShipmentLocks.has(order.id)) {
      this.logger.warn(
        `Shipment/AWB assignment is already in progress for order ${order.orderNumber}. Concurrent request skipped.`,
      );
      return {
        success: true,
        message: 'Shipment operation already in progress for this order',
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

    this.activeShipmentLocks.add(order.id);

    try {
      // 1. Idempotency check: if AWB is already assigned, DO NOT assign another AWB
      if (
        order.trackingNumber &&
        order.courierPartner &&
        order.courierPartner !== 'Unassigned'
      ) {
        this.logger.log(
          `AWB already assigned for order ${order.orderNumber} (courier: ${order.courierPartner}, tracking: ${order.trackingNumber}). Skipping assignment.`,
        );
        return {
          success: true,
          message: 'Shipment already exists for this order',
          isExisting: true,
          isAwbAssigned: true,
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

      let remoteOrderId = order.shiprocketOrderId;
      let shipmentId = order.shiprocketShipmentId;
      let trackingNumber = order.trackingNumber;
      let courierPartner = order.courierPartner;

      // 2. Check if provider shipment already exists. If not, create it.
      if (shipmentId) {
        this.logger.log(
          `Shipment already exists for order ${order.orderNumber} (shiprocketShipmentId: ${shipmentId}). Reusing existing shipment for AWB assignment.`,
        );
      } else {
        // Customer validation (no fake fallback)
        const customerEmail = (order.user?.email || '').trim();
        if (!customerEmail || !EMAIL_REGEX.test(customerEmail)) {
          throw new BadRequestException(
            'Valid customer email is required for shipment creation.',
          );
        }

        const customerName = (order.user?.name || '').trim();
        if (!customerName) {
          throw new BadRequestException(
            'Customer name is required before creating a shipment.',
          );
        }

        const customerPhone = (order.user?.phone || '').trim();
        if (!customerPhone) {
          throw new BadRequestException(
            'Customer phone number is required before creating a shipment.',
          );
        }

        // Address validation
        if (!order.address) {
          throw new BadRequestException(
            'Order does not have a delivery address associated.',
          );
        }

        const houseFlat = order.address.houseFlat?.trim();
        const buildingStreet = order.address.buildingStreet?.trim();
        if (!houseFlat && !buildingStreet) {
          throw new BadRequestException(
            'Shipping address line is required for shipment creation.',
          );
        }

        const city = order.address.city?.trim();
        const state = order.address.state?.trim();
        const pincode = order.address.pincode?.trim();
        if (!city || !state || !pincode) {
          throw new BadRequestException(
            'Shipping city, state, and pincode are required for shipment creation.',
          );
        }

        // Order items validation
        if (!order.items || order.items.length === 0) {
          throw new BadRequestException(
            'Order does not have any items associated.',
          );
        }

        // Pickup location validation (no hardcoded fallback)
        const activeProviderName = this.shippingProvider?.providerName || 'EKART';
        const pickupLocation = this.resolveConfiguredPickupLocation(
          options?.pickupLocation,
        );

        if (!pickupLocation) {
          throw new BadRequestException(
            `${activeProviderName} pickup location is not configured.`,
          );
        }

        // Package weight & dimensions validation & calculation (no silent fallbacks)
        const resolvedPackage = await this.resolveOrderShippingPackage(
          order.items,
        );

        let totalWeight: number | null = null;
        if (options?.packageDetails?.weight !== undefined) {
          if (
            typeof options.packageDetails.weight !== 'number' ||
            isNaN(options.packageDetails.weight) ||
            options.packageDetails.weight <= 0
          ) {
            throw new BadRequestException(
              'Shipment weight is required before creating a shipment.',
            );
          }
          totalWeight = options.packageDetails.weight;
        } else {
          totalWeight = resolvedPackage ? resolvedPackage.weight : null;
        }

        if (
          typeof totalWeight !== 'number' ||
          isNaN(totalWeight) ||
          totalWeight <= 0
        ) {
          throw new BadRequestException(
            'Shipment weight is required before creating a shipment.',
          );
        }

        // Package dimensions validation
        let dimensions: { length?: number; breadth?: number; height?: number } =
          {};
        if (
          options?.packageDetails?.length !== undefined ||
          options?.packageDetails?.breadth !== undefined ||
          options?.packageDetails?.height !== undefined
        ) {
          const l = options.packageDetails.length;
          const b = options.packageDetails.breadth;
          const h = options.packageDetails.height;

          if (
            typeof l !== 'number' ||
            typeof b !== 'number' ||
            typeof h !== 'number' ||
            l <= 0 ||
            b <= 0 ||
            h <= 0
          ) {
            throw new BadRequestException(
              'Package dimensions (length, breadth, height) must be positive numbers when provided.',
            );
          }
          dimensions = { length: l, breadth: b, height: h };
        } else if (
          resolvedPackage &&
          resolvedPackage.length > 0 &&
          resolvedPackage.breadth > 0 &&
          resolvedPackage.height > 0
        ) {
          dimensions = {
            length: resolvedPackage.length,
            breadth: resolvedPackage.breadth,
            height: resolvedPackage.height,
          };
        }

        // Compute volumetric and chargeable weight
        let volumetricWeight =
          options?.packageDetails?.volumetricWeight ??
          resolvedPackage?.volumetricWeight ??
          0;
        let chargeableWeight =
          options?.packageDetails?.chargeableWeight ?? 0;

        if (
          !chargeableWeight &&
          dimensions.length &&
          dimensions.breadth &&
          dimensions.height
        ) {
          volumetricWeight =
            Math.round(
              ((dimensions.length * dimensions.breadth * dimensions.height) /
                5000) *
                1000,
            ) / 1000;
          chargeableWeight = Math.max(totalWeight, volumetricWeight);
        }

        if (!chargeableWeight) {
          chargeableWeight =
            resolvedPackage?.chargeableWeight || totalWeight;
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
            volumetricWeight,
            chargeableWeight,
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
            country: order.address.country || 'India',
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

        const result =
          await this.shippingProvider.createShipment(shipmentParams);
        remoteOrderId = result.orderId ? String(result.orderId) : null;
        shipmentId = result.shipmentId ? String(result.shipmentId) : null;

        // Advance order status to PACKED when AWB is returned atomically with shipment
        const shouldAdvanceToPacked =
          Boolean(result.awbCode) &&
          (order.orderStatus === OrderStatusEnum.PLACED ||
            order.orderStatus === OrderStatusEnum.PROCESSING);
        const targetStatus = shouldAdvanceToPacked
          ? OrderStatusEnum.PACKED
          : order.orderStatus;

        // Persist remote shipment details to Order record immediately
        const saved = await this.prisma.order.update({
          where: { id: order.id },
          data: {
            shippingProvider: 'EKART',
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: 'Ekart',
            trackingNumber: result.awbCode || order.trackingNumber || null,
            orderStatus: targetStatus,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
            address: true,
          },
        });
        remoteOrderId = saved.shiprocketOrderId;
        shipmentId = saved.shiprocketShipmentId;
        if (saved.trackingNumber) {
          trackingNumber = saved.trackingNumber;
        }
        if (saved.courierPartner) {
          courierPartner = saved.courierPartner;
        }

        // Dispatch customer notification if status transitioned to PACKED
        if (shouldAdvanceToPacked && saved.orderStatus !== order.orderStatus) {
          try {
            this.notificationsService.notifyOrderStatusChange({
              orderId: saved.id,
              orderNumber: saved.orderNumber,
              userId: saved.userId,
              oldStatus: order.orderStatus,
              newStatus: saved.orderStatus,
              trackingNumber: saved.trackingNumber,
              courierPartner: saved.courierPartner,
              estimatedDelivery: saved.estimatedDelivery,
            });
          } catch (notifyErr: any) {
            this.logger.warn(
              `Failed to dispatch status notification for order ${order.orderNumber}: ${notifyErr?.message || notifyErr}`,
            );
          }
        }
      }

      // If AWB was already assigned by createShipment or order already has trackingNumber:
      if (trackingNumber) {
        const currentStatus =
          order.orderStatus === OrderStatusEnum.PLACED ||
          order.orderStatus === OrderStatusEnum.PROCESSING
            ? OrderStatusEnum.PACKED
            : order.orderStatus;

        return {
          success: true,
          message: 'Forward shipment created successfully',
          isExisting: false,
          isAwbAssigned: true,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            shippingProvider: order.shippingProvider,
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: courierPartner || order.courierPartner,
            trackingNumber: trackingNumber,
            status: currentStatus,
          },
        };
      }

      // If provider does not support serviceability/AWB or no shipment ID returned:
      if (
        !shipmentId ||
        typeof this.shippingProvider.getRecommendedCourier !== 'function' ||
        typeof this.shippingProvider.assignAwb !== 'function'
      ) {
        return {
          success: true,
          message: 'Forward shipment created successfully',
          isExisting: false,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            shippingProvider: order.shippingProvider,
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: order.courierPartner,
            trackingNumber: order.trackingNumber,
            status: order.orderStatus,
          },
        };
      }

      // 3. Resolve pickup location & pincode
      const pickupLocation = this.resolveConfiguredPickupLocation(
        options?.pickupLocation,
      );

      let pickupPostcode =
        options?.pickupPostcode ||
        this.resolveConfiguredPickupPincode();
      if (!pickupPostcode && this.shippingProvider.getPickupLocationPincode) {
        try {
          pickupPostcode =
            (await this.shippingProvider.getPickupLocationPincode(
              pickupLocation,
            )) || '';
        } catch (pinErr: any) {
          this.logger.warn(
            `Could not resolve pickup pincode for location "${pickupLocation}": ${pinErr?.message || pinErr}`,
          );
        }
      }

      // 4. Resolve package details
      const resolvedPackage = await this.resolveOrderShippingPackage(
        order.items,
      );
      const weight =
        options?.packageDetails?.weight || resolvedPackage?.weight || 0.5;
      const length = options?.packageDetails?.length || resolvedPackage?.length;
      const breadth =
        options?.packageDetails?.breadth || resolvedPackage?.breadth;
      const height = options?.packageDetails?.height || resolvedPackage?.height;
      const isCod = order.paymentMethod?.toUpperCase() === 'COD';

      // 5. Courier serviceability query
      let recommendedCourier: AvailableCourier | null = null;
      if (pickupPostcode && order.address?.pincode) {
        try {
          recommendedCourier =
            await this.shippingProvider.getRecommendedCourier({
              pickupPostcode,
              deliveryPostcode: order.address.pincode,
              weight,
              cod: isCod,
              length,
              breadth,
              height,
            });
        } catch (serviceabilityErr: any) {
          this.logger.warn(
            `Courier serviceability check failed for order ${order.orderNumber} (shipment ${shipmentId}): ${serviceabilityErr?.message || serviceabilityErr}`,
          );
        }
      }

      if (!recommendedCourier) {
        this.logger.warn(
          `No serviceable courier found for order ${order.orderNumber} (shipment ${shipmentId}). Keeping shipment for retry.`,
        );
        return {
          success: true,
          message: 'Shipment created; waiting for courier serviceability',
          isExisting: false,
          isAwbAssigned: false,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            shippingProvider: order.shippingProvider,
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: order.courierPartner,
            trackingNumber: order.trackingNumber,
            status: order.orderStatus,
          },
        };
      }

      // 6. Assign real AWB
      let awbResult: AssignAwbResult;
      try {
        awbResult = await this.shippingProvider.assignAwb({
          shipmentId,
          courierId: recommendedCourier.courierCompanyId,
        });
      } catch (awbErr: any) {
        this.logger.error(
          `AWB assignment call failed for order ${order.orderNumber} (shipment ${shipmentId}): ${awbErr?.message || awbErr}`,
        );
        return {
          success: true,
          message:
            'Shipment created, but AWB assignment failed. Ready for retry.',
          isExisting: false,
          isAwbAssigned: false,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            shippingProvider: order.shippingProvider,
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: order.courierPartner,
            trackingNumber: order.trackingNumber,
            status: order.orderStatus,
          },
        };
      }

      if (!awbResult.isSuccess || !awbResult.awbCode) {
        this.logger.warn(
          `AWB assignment unsuccessful for order ${order.orderNumber} (shipment ${shipmentId}): ${awbResult.message}`,
        );
        return {
          success: true,
          message: `Shipment created, but AWB assignment unsuccessful: ${awbResult.message}`,
          isExisting: false,
          isAwbAssigned: false,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            shippingProvider: order.shippingProvider,
            shiprocketOrderId: remoteOrderId,
            shiprocketShipmentId: shipmentId,
            courierPartner: order.courierPartner,
            trackingNumber: order.trackingNumber,
            status: order.orderStatus,
          },
        };
      }

      // 7. Persist real AWB and Courier to Order
      const finalCourier =
        awbResult.courierName || recommendedCourier.courierName;
      const finalAwb = awbResult.awbCode;

      // Advance order status to PACKED (Ready to Ship / AWB Assigned)
      const nextStatus =
        order.orderStatus === OrderStatusEnum.PLACED ||
        order.orderStatus === OrderStatusEnum.PROCESSING
          ? OrderStatusEnum.PACKED
          : order.orderStatus;

      const finalEstimatedDate = recommendedCourier.etd
        ? new Date(recommendedCourier.etd)
        : order.estimatedDelivery || undefined;

      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          courierPartner: finalCourier,
          trackingNumber: finalAwb,
          orderStatus: nextStatus,
          ...(finalEstimatedDate && { estimatedDelivery: finalEstimatedDate }),
        },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          address: true,
        },
      });

      // 8. Pickup Queue Status Check
      if (awbResult.pickupScheduledDate) {
        this.logger.log(
          `Pickup scheduled automatically for order ${order.orderNumber} (date: ${awbResult.pickupScheduledDate}). No duplicate pickup call required.`,
        );
      }

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
        message: 'Shipment created and AWB assigned successfully',
        isExisting: false,
        isAwbAssigned: true,
        data: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          shippingProvider: updated.shippingProvider,
          shiprocketOrderId: updated.shiprocketOrderId,
          shiprocketShipmentId: updated.shiprocketShipmentId,
          courierPartner: updated.courierPartner,
          trackingNumber: updated.trackingNumber,
          status: updated.orderStatus,
          pickupScheduledDate: awbResult.pickupScheduledDate,
        },
      };
    } finally {
      this.activeShipmentLocks.delete(order.id);
    }
  }


  
  /**
   * Cancels the forward shipment held with the active shipping provider for an
   * order that has already been cancelled inside KickAt.
   *
   * This is intentionally tolerant: it never throws for "nothing to cancel" or
   * for an unsupported provider, because the customer-facing cancel flow calls
   * it as a best-effort cleanup step and must not fail because of it.
   */
  async cancelShipmentForOrder(orderIdentifier: string): Promise<{
    success: boolean;
    message: string;
    data?: {
      orderId: string;
      orderNumber: string;
      shiprocketOrderId: string | null;
      shiprocketShipmentId: string | null;
    };
  }> {
    const order = await this.findOrderByAnyIdentifier(orderIdentifier);

    // Nothing was ever pushed to the provider -> nothing to cancel.
    if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
      this.logger.log(
        `No provider shipment exists for order ${order.orderNumber}; skipping provider cancellation.`,
      );
      return {
        success: true,
        message: 'No provider shipment to cancel for this order',
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shiprocketOrderId: order.shiprocketOrderId,
          shiprocketShipmentId: order.shiprocketShipmentId,
        },
      };
    }

    // Active provider cannot cancel (e.g. the null/unconfigured provider).
    if (typeof this.shippingProvider.cancelShipment !== 'function') {
      this.logger.warn(
        `Active shipping provider ${this.shippingProvider.providerName} does not support shipment cancellation (order ${order.orderNumber}).`,
      );
      return {
        success: false,
        message: `Provider ${this.shippingProvider.providerName} does not support shipment cancellation`,
      };
    }

    const result = await this.shippingProvider.cancelShipment({
      shiprocketOrderId: order.shiprocketOrderId,
      shiprocketShipmentId: order.shiprocketShipmentId,
    });

    this.logger.log(
      `Provider shipment cancellation for order ${order.orderNumber}: ${result.message}`,
    );

    return {
      success: result.success,
      message: result.message,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        shiprocketOrderId: order.shiprocketOrderId,
        shiprocketShipmentId: order.shiprocketShipmentId,
      },
    };
  }
}
