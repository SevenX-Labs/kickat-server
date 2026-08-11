import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';
import {
  ChartGroupByEnum,
  DashboardPeriodEnum,
  DashboardQueryDto,
  LowStockQueryDto,
  RecentOrdersQueryDto,
  SalesChartQueryDto,
  TopCategoriesQueryDto,
} from './dto/dashboard-query.dto';

export interface DateRange {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to compute start/end dates for current and previous comparison periods.
   */
  private getDateRange(
    period: DashboardPeriodEnum = DashboardPeriodEnum.SEVEN_DAYS,
    customStart?: string,
    customEnd?: string,
  ): DateRange {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);
    let previousStart: Date;
    let previousEnd: Date;

    if (period === DashboardPeriodEnum.CUSTOM && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
      const diffMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime());
      previousStart = new Date(start.getTime() - diffMs);
      return { start, end, previousStart, previousEnd };
    }

    switch (period) {
      case DashboardPeriodEnum.TODAY: {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        previousStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        previousEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      }
      case DashboardPeriodEnum.THIS_WEEK: {
        const dayOfWeek = now.getDay();
        const diffToMonday = (dayOfWeek + 6) % 7;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
        const duration = end.getTime() - start.getTime();
        previousEnd = new Date(start.getTime() - 1);
        previousStart = new Date(previousEnd.getTime() - duration);
        break;
      }
      case DashboardPeriodEnum.THIS_MONTH: {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      }
      case DashboardPeriodEnum.THIRTY_DAYS: {
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(start.getTime());
        break;
      }
      case DashboardPeriodEnum.THIS_YEAR: {
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        previousStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
        previousEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      }
      case DashboardPeriodEnum.TWELVE_MONTHS: {
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(start.getTime());
        break;
      }
      case DashboardPeriodEnum.ALL: {
        start = new Date(0);
        previousStart = new Date(0);
        previousEnd = new Date(0);
        break;
      }
      case DashboardPeriodEnum.SEVEN_DAYS:
      default: {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        previousEnd = new Date(start.getTime());
        break;
      }
    }

    return { start, end, previousStart, previousEnd };
  }

  /**
   * Calculate percentage growth safely
   */
  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  /**
   * Main Unified Dashboard Summary (GET /api/v1/admin/dashboard)
   */
  async getDashboardSummary(query: DashboardQueryDto = {}) {
    const period = query.period || DashboardPeriodEnum.SEVEN_DAYS;
    const lowStockThreshold = query.lowStockThreshold ?? 10;
    const recentOrdersLimit = query.recentOrdersLimit ?? 10;
    const topCategoriesLimit = query.topCategoriesLimit ?? 5;

    const [
      stats,
      salesChart,
      orderStatusSummary,
      topCategories,
      recentOrders,
      lowStockProducts,
      paymentMethodSummary,
    ] = await Promise.all([
      this.getStats(query),
      this.getSalesChartData({
        period,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
      this.getOrderStatusSummary(),
      this.getTopSellingCategories({
        period,
        limit: topCategoriesLimit,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
      this.getRecentOrders({ limit: recentOrdersLimit }),
      this.getLowStockProducts({ threshold: lowStockThreshold, limit: 10 }),
      this.getPaymentMethodSummary(query),
    ]);

    return {
      success: true,
      data: {
        summary: stats,
        salesChart,
        orderStatusSummary,
        topCategories,
        recentOrders,
        lowStockProducts,
        paymentMethodSummary,
      },
    };
  }

  /**
   * 1. Overall & Period KPI Stats (Total revenue, orders, customers, today orders, pending, low-stock, refund requests)
   */
  async getStats(query: DashboardQueryDto = {}) {
    const period = query.period || DashboardPeriodEnum.SEVEN_DAYS;
    const lowStockThreshold = query.lowStockThreshold ?? 10;
    const { start, end, previousStart, previousEnd } = this.getDateRange(
      period,
      query.startDate,
      query.endDate,
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [
      // 1. Total All-time Revenue & Orders
      allTimeRevenueAgg,
      totalOrdersCount,
      totalCustomersCount,

      // 2. Today's orders and revenue
      todayOrdersAgg,

      // 3. Pending orders
      pendingOrdersCount,
      placedOrdersCount,
      processingOrdersCount,

      // 4. Low stock and Out of stock counts
      lowStockProductsCount,
      outOfStockProductsCount,
      lowStockVariantsCount,
      outOfStockVariantsCount,

      // 5. Refund / Return requests
      pendingRefundsCount,
      totalRefundsCount,

      // 6. Period Revenue and Orders
      periodRevenueAgg,
      periodOrdersCount,

      // 7. Previous Period Revenue and Orders (for growth %)
      prevPeriodRevenueAgg,
      prevPeriodOrdersCount,

      // 8. New customers in period & today
      newCustomersPeriodCount,
      newCustomersPrevPeriodCount,
      newCustomersTodayCount,
    ] = await Promise.all([
      // All-time valid revenue (non-cancelled)
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: { orderStatus: { not: OrderStatusEnum.CANCELLED } },
      }),
      // Total orders
      this.prisma.order.count(),
      // Total customers
      this.prisma.user.count(),

      // Today's orders & revenue
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        _count: { id: true },
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
          orderStatus: { not: OrderStatusEnum.CANCELLED },
        },
      }),

      // Pending statuses
      this.prisma.order.count({ where: { orderStatus: OrderStatusEnum.PENDING } }),
      this.prisma.order.count({ where: { orderStatus: OrderStatusEnum.PLACED } }),
      this.prisma.order.count({ where: { orderStatus: OrderStatusEnum.PROCESSING } }),

      // Low stock products (stock <= threshold and stock > 0)
      this.prisma.product.count({
        where: {
          deletedAt: null,
          stock: { gt: 0, lte: lowStockThreshold },
        },
      }),
      // Out of stock products (stock = 0)
      this.prisma.product.count({
        where: {
          deletedAt: null,
          stock: 0,
        },
      }),
      // Low stock variants
      this.prisma.productVariant.count({
        where: {
          product: { deletedAt: null },
          stock: { gt: 0, lte: lowStockThreshold },
        },
      }),
      // Out of stock variants
      this.prisma.productVariant.count({
        where: {
          product: { deletedAt: null },
          stock: 0,
        },
      }),

      // Refund / Return requests
      this.prisma.orderReturn.count({ where: { status: 'INITIATED' } }),
      this.prisma.orderReturn.count(),

      // Current Period revenue
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: {
          createdAt: { gte: start, lte: end },
          orderStatus: { not: OrderStatusEnum.CANCELLED },
        },
      }),
      // Current Period orders count
      this.prisma.order.count({
        where: { createdAt: { gte: start, lte: end } },
      }),

      // Previous Period revenue
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: {
          createdAt: { gte: previousStart, lte: previousEnd },
          orderStatus: { not: OrderStatusEnum.CANCELLED },
        },
      }),
      // Previous Period orders count
      this.prisma.order.count({
        where: { createdAt: { gte: previousStart, lte: previousEnd } },
      }),

      // Customer signups
      this.prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.user.count({ where: { createdAt: { gte: previousStart, lte: previousEnd } } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
    ]);

    const totalRevenue = allTimeRevenueAgg._sum.grandTotal ?? 0;
    const todayRevenue = todayOrdersAgg._sum.grandTotal ?? 0;
    const todayOrders = todayOrdersAgg._count.id ?? 0;

    const periodRevenue = periodRevenueAgg._sum.grandTotal ?? 0;
    const prevPeriodRevenue = prevPeriodRevenueAgg._sum.grandTotal ?? 0;
    const revenueGrowth = this.calculateGrowth(periodRevenue, prevPeriodRevenue);

    const ordersGrowth = this.calculateGrowth(periodOrdersCount, prevPeriodOrdersCount);
    const customersGrowth = this.calculateGrowth(newCustomersPeriodCount, newCustomersPrevPeriodCount);

    const totalLowStock = lowStockProductsCount + lowStockVariantsCount;
    const totalOutOfStock = outOfStockProductsCount + outOfStockVariantsCount;
    const totalPendingOrders = pendingOrdersCount + placedOrdersCount + processingOrdersCount;

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalOrders: totalOrdersCount,
      totalCustomers: totalCustomersCount,
      todayOrders,
      todayRevenue: Number(todayRevenue.toFixed(2)),
      pendingOrders: totalPendingOrders,
      pendingOrdersBreakdown: {
        pending: pendingOrdersCount,
        placed: placedOrdersCount,
        processing: processingOrdersCount,
      },
      lowStockProducts: totalLowStock,
      outOfStockProducts: totalOutOfStock,
      totalInventoryAlerts: totalLowStock + totalOutOfStock,
      refundRequests: pendingRefundsCount,
      totalRefundRequests: totalRefundsCount,
      periodMetrics: {
        period,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        revenue: Number(periodRevenue.toFixed(2)),
        orders: periodOrdersCount,
        newCustomers: newCustomersPeriodCount,
        newCustomersToday: newCustomersTodayCount,
        growth: {
          revenuePercentage: revenueGrowth,
          ordersPercentage: ordersGrowth,
          customersPercentage: customersGrowth,
        },
      },
    };
  }

  /**
   * 2. Sales Chart Time-Series Data (GET /api/v1/admin/dashboard/sales-chart)
   */
  async getSalesChartData(query: SalesChartQueryDto = {}) {
    const period = query.period || DashboardPeriodEnum.SEVEN_DAYS;
    const { start, end } = this.getDateRange(period, query.startDate, query.endDate);

    // Fetch all non-cancelled orders in the range
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        orderStatus: { not: OrderStatusEnum.CANCELLED },
      },
      select: {
        id: true,
        grandTotal: true,
        createdAt: true,
        items: {
          select: { quantity: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Determine bucket granularity
    let groupBy = query.groupBy;
    if (!groupBy) {
      if (period === DashboardPeriodEnum.TODAY) {
        groupBy = ChartGroupByEnum.HOUR;
      } else if (
        period === DashboardPeriodEnum.THIS_YEAR ||
        period === DashboardPeriodEnum.TWELVE_MONTHS
      ) {
        groupBy = ChartGroupByEnum.MONTH;
      } else {
        groupBy = ChartGroupByEnum.DAY;
      }
    }

    // Generate buckets map
    const bucketsMap = new Map<
      string,
      { label: string; date: string; revenue: number; ordersCount: number; itemsCount: number }
    >();

    const formatBucketKey = (date: Date): { key: string; label: string; dateStr: string } => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');

      if (groupBy === ChartGroupByEnum.HOUR) {
        return {
          key: `${year}-${month}-${day}T${hour}:00`,
          label: `${hour}:00`,
          dateStr: `${year}-${month}-${day}T${hour}:00:00.000Z`,
        };
      } else if (groupBy === ChartGroupByEnum.MONTH) {
        const monthName = date.toLocaleString('default', { month: 'short' });
        return {
          key: `${year}-${month}`,
          label: `${monthName} ${year}`,
          dateStr: `${year}-${month}-01`,
        };
      } else if (groupBy === ChartGroupByEnum.WEEK) {
        const firstDayOfWeek = new Date(date);
        firstDayOfWeek.setDate(date.getDate() - date.getDay());
        const wMonth = String(firstDayOfWeek.getMonth() + 1).padStart(2, '0');
        const wDay = String(firstDayOfWeek.getDate()).padStart(2, '0');
        return {
          key: `${firstDayOfWeek.getFullYear()}-W${wMonth}-${wDay}`,
          label: `Week of ${firstDayOfWeek.toLocaleString('default', { month: 'short' })} ${wDay}`,
          dateStr: `${firstDayOfWeek.getFullYear()}-${wMonth}-${wDay}`,
        };
      } else {
        // DAY
        const dayLabel = date.toLocaleString('default', { month: 'short', day: 'numeric' });
        return {
          key: `${year}-${month}-${day}`,
          label: dayLabel,
          dateStr: `${year}-${month}-${day}`,
        };
      }
    };

    // Pre-populate empty intervals
    const cursor = new Date(start);
    while (cursor <= end) {
      const { key, label, dateStr } = formatBucketKey(cursor);
      if (!bucketsMap.has(key)) {
        bucketsMap.set(key, {
          key,
          label,
          date: dateStr,
          revenue: 0,
          ordersCount: 0,
          itemsCount: 0,
        } as any);
      }

      if (groupBy === ChartGroupByEnum.HOUR) {
        cursor.setHours(cursor.getHours() + 1);
      } else if (groupBy === ChartGroupByEnum.MONTH) {
        cursor.setMonth(cursor.getMonth() + 1);
      } else if (groupBy === ChartGroupByEnum.WEEK) {
        cursor.setDate(cursor.getDate() + 7);
      } else {
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // Populate actual order data
    for (const order of orders) {
      const { key, label, dateStr } = formatBucketKey(order.createdAt);
      let bucket = bucketsMap.get(key);
      if (!bucket) {
        bucket = {
          label,
          date: dateStr,
          revenue: 0,
          ordersCount: 0,
          itemsCount: 0,
        };
        bucketsMap.set(key, bucket);
      }

      bucket.revenue += order.grandTotal;
      bucket.ordersCount += 1;
      const totalItemsInOrder = order.items.reduce((sum, i) => sum + i.quantity, 0);
      bucket.itemsCount += totalItemsInOrder;
    }

    const series = Array.from(bucketsMap.values()).map((b) => ({
      date: b.date,
      label: b.label,
      revenue: Number(b.revenue.toFixed(2)),
      ordersCount: b.ordersCount,
      itemsCount: b.itemsCount,
      averageOrderValue:
        b.ordersCount > 0 ? Number((b.revenue / b.ordersCount).toFixed(2)) : 0,
    }));

    const totalRevenue = series.reduce((sum, item) => sum + item.revenue, 0);
    const totalOrders = series.reduce((sum, item) => sum + item.ordersCount, 0);
    const totalItems = series.reduce((sum, item) => sum + item.itemsCount, 0);

    return {
      period,
      groupBy,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
        totalItems,
        averageOrderValue:
          totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
      },
      chartData: series,
    };
  }

  /**
   * 3. Recent Orders Feed (GET /api/v1/admin/dashboard/recent-orders)
   */
  async getRecentOrders(query: RecentOrdersQueryDto = {}) {
    const limit = query.limit ?? 10;
    const whereClause: any = {};
    if (query.status) {
      whereClause.orderStatus = query.status;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            variantName: true,
            quantity: true,
            price: true,
            totalPrice: true,
          },
        },
        payments: {
          select: {
            id: true,
            status: true,
            paymentMethod: true,
            amount: true,
          },
        },
      },
    });

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
          name: order.user?.name || 'Guest / Customer',
          email: order.user?.email || null,
          phone: order.user?.phone || null,
        },
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        grandTotal: order.grandTotal,
        itemsCount,
        itemsSummary,
        items: order.items,
        latestPayment: order.payments[0] || null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
    });

    return {
      total: formattedOrders.length,
      orders: formattedOrders,
    };
  }

  /**
   * 4. Order Status Distribution Summary (GET /api/v1/admin/dashboard/order-status-summary)
   */
  async getOrderStatusSummary() {
    const totalOrders = await this.prisma.order.count();

    const statusGroups = await this.prisma.order.groupBy({
      by: ['orderStatus'],
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    const statusMap = new Map<
      OrderStatusEnum,
      { count: number; revenue: number }
    >();

    for (const group of statusGroups) {
      statusMap.set(group.orderStatus, {
        count: group._count.id,
        revenue: group._sum.grandTotal ?? 0,
      });
    }

    const allStatuses: OrderStatusEnum[] = [
      OrderStatusEnum.PENDING,
      OrderStatusEnum.PLACED,
      OrderStatusEnum.PROCESSING,
      OrderStatusEnum.PACKED,
      OrderStatusEnum.SHIPPED,
      OrderStatusEnum.OUT_FOR_DELIVERY,
      OrderStatusEnum.DELIVERED,
      OrderStatusEnum.CANCELLED,
      OrderStatusEnum.RETURN_INITIATED,
      OrderStatusEnum.RETURNED,
    ];

    const breakdown = allStatuses.map((status) => {
      const data = statusMap.get(status) || { count: 0, revenue: 0 };
      const percentage =
        totalOrders > 0 ? Number(((data.count / totalOrders) * 100).toFixed(2)) : 0;

      return {
        status,
        label: this.formatStatusLabel(status),
        count: data.count,
        percentage,
        revenue: Number(data.revenue.toFixed(2)),
      };
    });

    return {
      totalOrders,
      breakdown,
    };
  }

  /**
   * 5. Top-Selling Categories (GET /api/v1/admin/dashboard/top-categories)
   */
  async getTopSellingCategories(query: TopCategoriesQueryDto = {}) {
    const limit = query.limit ?? 5;
    const period = query.period || DashboardPeriodEnum.ALL;
    const { start, end } = this.getDateRange(period, query.startDate, query.endDate);

    const orderWhere: any = {
      orderStatus: { not: OrderStatusEnum.CANCELLED },
    };

    if (period !== DashboardPeriodEnum.ALL) {
      orderWhere.createdAt = { gte: start, lte: end };
    }

    // Fetch order items with their orders
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: orderWhere,
      },
      select: {
        productId: true,
        quantity: true,
        totalPrice: true,
      },
    });

    if (orderItems.length === 0) {
      return {
        period,
        totalCategories: 0,
        categories: [],
      };
    }

    // Aggregate by productId
    const productStats = new Map<string, { units: number; revenue: number }>();
    for (const item of orderItems) {
      const existing = productStats.get(item.productId) || { units: 0, revenue: 0 };
      existing.units += item.quantity;
      existing.revenue += item.totalPrice;
      productStats.set(item.productId, existing);
    }

    // Fetch products with their categories
    const productIds = Array.from(productStats.keys());
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
          },
        },
      },
    });

    // Aggregate by category
    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        name: string;
        slug: string;
        imageUrl: string | null;
        totalRevenue: number;
        totalUnitsSold: number;
        productsCount: number;
      }
    >();

    let grandTotalRevenue = 0;

    for (const product of products) {
      const cat = product.category;
      if (!cat) continue;

      const stat = productStats.get(product.id) || { units: 0, revenue: 0 };
      grandTotalRevenue += stat.revenue;

      const existingCat = categoryMap.get(cat.id) || {
        categoryId: cat.id,
        name: cat.name,
        slug: cat.slug,
        imageUrl: cat.imageUrl,
        totalRevenue: 0,
        totalUnitsSold: 0,
        productsCount: 0,
      };

      existingCat.totalRevenue += stat.revenue;
      existingCat.totalUnitsSold += stat.units;
      existingCat.productsCount += 1;
      categoryMap.set(cat.id, existingCat);
    }

    const sortedCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit)
      .map((cat) => ({
        ...cat,
        totalRevenue: Number(cat.totalRevenue.toFixed(2)),
        percentageOfTotal:
          grandTotalRevenue > 0
            ? Number(((cat.totalRevenue / grandTotalRevenue) * 100).toFixed(2))
            : 0,
      }));

    return {
      period,
      totalCategories: categoryMap.size,
      totalRevenue: Number(grandTotalRevenue.toFixed(2)),
      categories: sortedCategories,
    };
  }

  /**
   * 6. Low-Stock & Out-of-Stock Products (GET /api/v1/admin/dashboard/low-stock)
   */
  async getLowStockProducts(query: LowStockQueryDto = {}) {
    const threshold = query.threshold ?? 10;
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const skip = (page - 1) * limit;

    // 1. Fetch main products with low stock
    const lowStockProducts = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        stock: { lte: threshold },
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      take: limit,
      skip,
      orderBy: { stock: 'asc' },
    });

    // 2. Fetch variants with low stock
    const lowStockVariants = await this.prisma.productVariant.findMany({
      where: {
        stock: { lte: threshold },
        product: { deletedAt: null },
      },
      include: {
        product: {
          include: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      take: limit,
      orderBy: { stock: 'asc' },
    });

    const items = [
      ...lowStockProducts.map((p) => ({
        id: p.id,
        type: 'PRODUCT',
        productId: p.id,
        variantId: null,
        name: p.name,
        slug: p.slug,
        sku: null,
        imageUrl: p.imageUrl,
        category: p.category?.name || 'Uncategorized',
        price: p.price,
        currentStock: p.stock,
        isOutOfStock: p.stock === 0,
        status: p.status,
      })),
      ...lowStockVariants.map((v) => ({
        id: v.id,
        type: 'VARIANT',
        productId: v.productId,
        variantId: v.id,
        name: `${v.product.name} - ${v.name}`,
        slug: v.product.slug,
        sku: v.sku,
        imageUrl: v.imageUrl || v.product.imageUrl,
        category: v.product.category?.name || 'Uncategorized',
        price: v.price,
        currentStock: v.stock,
        isOutOfStock: v.stock === 0,
        status: v.product.status,
      })),
    ].sort((a, b) => a.currentStock - b.currentStock);

    const totalCount = await this.prisma.product.count({
      where: { deletedAt: null, stock: { lte: threshold } },
    });

    return {
      threshold,
      totalLowStockItems: totalCount + lowStockVariants.length,
      page,
      limit,
      items: items.slice(0, limit),
    };
  }

  /**
   * 7. Payment Methods Breakdown Summary
   */
  async getPaymentMethodSummary(query: DashboardQueryDto = {}) {
    const period = query.period || DashboardPeriodEnum.ALL;
    const { start, end } = this.getDateRange(period, query.startDate, query.endDate);

    const where: any = {
      orderStatus: { not: OrderStatusEnum.CANCELLED },
    };
    if (period !== DashboardPeriodEnum.ALL) {
      where.createdAt = { gte: start, lte: end };
    }

    const groups = await this.prisma.order.groupBy({
      by: ['paymentMethod', 'paymentStatus'],
      where,
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    const methodMap = new Map<
      PaymentMethodEnum,
      { count: number; totalAmount: number; completedCount: number; pendingCount: number }
    >();

    let totalAmountAll = 0;
    let totalCountAll = 0;

    for (const g of groups) {
      const method = g.paymentMethod;
      const count = g._count.id;
      const amount = g._sum.grandTotal ?? 0;

      totalAmountAll += amount;
      totalCountAll += count;

      const existing = methodMap.get(method) || {
        count: 0,
        totalAmount: 0,
        completedCount: 0,
        pendingCount: 0,
      };

      existing.count += count;
      existing.totalAmount += amount;
      if (g.paymentStatus === PaymentStatusEnum.COMPLETED) {
        existing.completedCount += count;
      } else if (g.paymentStatus === PaymentStatusEnum.PENDING) {
        existing.pendingCount += count;
      }
      methodMap.set(method, existing);
    }

    const allMethods: PaymentMethodEnum[] = [
      PaymentMethodEnum.UPI,
      PaymentMethodEnum.CARD,
      PaymentMethodEnum.WALLET,
      PaymentMethodEnum.NETBANKING,
      PaymentMethodEnum.COD,
    ];

    const breakdown = allMethods.map((method) => {
      const data = methodMap.get(method) || {
        count: 0,
        totalAmount: 0,
        completedCount: 0,
        pendingCount: 0,
      };

      return {
        method,
        count: data.count,
        totalAmount: Number(data.totalAmount.toFixed(2)),
        completedCount: data.completedCount,
        pendingCount: data.pendingCount,
        percentage:
          totalCountAll > 0
            ? Number(((data.count / totalCountAll) * 100).toFixed(2))
            : 0,
      };
    });

    return {
      totalOrders: totalCountAll,
      totalAmount: Number(totalAmountAll.toFixed(2)),
      breakdown,
    };
  }

  private formatStatusLabel(status: OrderStatusEnum): string {
    switch (status) {
      case OrderStatusEnum.PENDING:
        return 'Pending';
      case OrderStatusEnum.PLACED:
        return 'Placed';
      case OrderStatusEnum.PROCESSING:
        return 'Processing';
      case OrderStatusEnum.PACKED:
        return 'Packed';
      case OrderStatusEnum.SHIPPED:
        return 'Shipped';
      case OrderStatusEnum.OUT_FOR_DELIVERY:
        return 'Out for Delivery';
      case OrderStatusEnum.DELIVERED:
        return 'Delivered';
      case OrderStatusEnum.CANCELLED:
        return 'Cancelled';
      case OrderStatusEnum.RETURN_INITIATED:
        return 'Return Initiated';
      case OrderStatusEnum.RETURNED:
        return 'Returned';
      default:
        return status;
    }
  }
}
