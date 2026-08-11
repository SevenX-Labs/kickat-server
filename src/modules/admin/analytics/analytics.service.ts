import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AnalyticsDateRangeDto,
  AnalyticsGroupByEnum,
  ProductAnalyticsQueryDto,
} from './dto/admin-analytics.dto';
import { OrderStatusEnum, PaymentMethodEnum } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to parse and resolve date range defaults (last 30 days if not provided)
   */
  private resolveDateRange(dto: { dateFrom?: string; dateTo?: string }) {
    const to = dto.dateTo ? new Date(dto.dateTo) : new Date();
    // Default to 30 days prior if dateFrom not supplied
    const from = dto.dateFrom
      ? new Date(dto.dateFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    return { from, to };
  }

  /**
   * Helper to format a Date into time bucket key (YYYY-MM-DD, YYYY-WW, or YYYY-MM)
   */
  private formatBucketKey(date: Date, groupBy: AnalyticsGroupByEnum = AnalyticsGroupByEnum.DAY): string {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');

    if (groupBy === AnalyticsGroupByEnum.MONTH) {
      return `${y}-${m}`;
    }
    if (groupBy === AnalyticsGroupByEnum.WEEK) {
      const firstDayOfYear = new Date(Date.UTC(y, 0, 1));
      const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
      return `${y}-W${String(weekNum).padStart(2, '0')}`;
    }
    return `${y}-${m}-${day}`;
  }

  /**
   * GET /api/v1/admin/analytics/sales
   * Sales volume, units sold, AOV, time-series chart, and breakdown by payment method & category
   */
  async getSalesAnalytics(dto: AnalyticsDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(dto);
    const groupBy = dto.groupBy || AnalyticsGroupByEnum.DAY;

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        orderStatus: { not: OrderStatusEnum.CANCELLED },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalSalesAmount = 0;
    let totalUnitsSold = 0;
    const bucketMap = new Map<string, { salesAmount: number; unitsSold: number; ordersCount: number }>();
    const paymentMap = new Map<PaymentMethodEnum, { amount: number; count: number }>();
    const categoryMap = new Map<string, { unitsSold: number; revenue: number }>();

    for (const order of orders) {
      const orderTotal = order.grandTotal;
      totalSalesAmount += orderTotal;

      const orderUnits = order.items.reduce((sum, i) => sum + i.quantity, 0);
      totalUnitsSold += orderUnits;

      // Group by date bucket
      const bucketKey = this.formatBucketKey(order.createdAt, groupBy);
      const existingBucket = bucketMap.get(bucketKey) || { salesAmount: 0, unitsSold: 0, ordersCount: 0 };
      existingBucket.salesAmount += orderTotal;
      existingBucket.unitsSold += orderUnits;
      existingBucket.ordersCount += 1;
      bucketMap.set(bucketKey, existingBucket);

      // Payment method breakdown
      const pm = order.paymentMethod;
      const existingPm = paymentMap.get(pm) || { amount: 0, count: 0 };
      existingPm.amount += orderTotal;
      existingPm.count += 1;
      paymentMap.set(pm, existingPm);

      // Category breakdown from items
      for (const item of order.items) {
        const catKey = 'General'; // fallback
        const existingCat = categoryMap.get(catKey) || { unitsSold: 0, revenue: 0 };
        existingCat.unitsSold += item.quantity;
        existingCat.revenue += item.totalPrice;
        categoryMap.set(catKey, existingCat);
      }
    }

    const totalOrders = orders.length;
    const averageOrderValue =
      totalOrders > 0 ? Number((totalSalesAmount / totalOrders).toFixed(2)) : 0;

    const chartData = Array.from(bucketMap.entries()).map(([date, data]) => ({
      date,
      label: date,
      salesAmount: Number(data.salesAmount.toFixed(2)),
      unitsSold: data.unitsSold,
      ordersCount: data.ordersCount,
    }));

    const topSalesByPaymentMethod = Array.from(paymentMap.entries()).map(([method, data]) => ({
      paymentMethod: method,
      salesAmount: Number(data.amount.toFixed(2)),
      ordersCount: data.count,
      percentage:
        totalSalesAmount > 0
          ? Number(((data.amount / totalSalesAmount) * 100).toFixed(1))
          : 0,
    }));

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString(), groupBy },
        summary: {
          totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
          totalOrders,
          totalUnitsSold,
          averageOrderValue,
        },
        chartData,
        topSalesByPaymentMethod,
      },
    };
  }

  /**
   * GET /api/v1/admin/analytics/revenue
   * Gross revenue, net revenue, refunds, delivery fees, and period comparisons
   */
  async getRevenueAnalytics(dto: AnalyticsDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(dto);
    const groupBy = dto.groupBy || AnalyticsGroupByEnum.DAY;

    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);
    const prevTo = new Date(from.getTime());

    const [orders, prevOrders, returnCount] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          grandTotal: true,
          subtotal: true,
          deliveryFee: true,
          orderStatus: true,
          paymentMethod: true,
          createdAt: true,
        },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: prevFrom, lte: prevTo },
          orderStatus: { not: OrderStatusEnum.CANCELLED },
        },
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      this.prisma.orderReturn.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
    ]);

    let grossRevenue = 0;
    let subtotalRevenue = 0;
    let deliveryFeeRevenue = 0;
    let refundedAmount = 0;

    const bucketMap = new Map<
      string,
      { grossRevenue: number; netRevenue: number; deliveryFee: number; refunds: number }
    >();
    const paymentMap = new Map<PaymentMethodEnum, { amount: number; count: number }>();

    for (const order of orders) {
      const isCancelled = order.orderStatus === OrderStatusEnum.CANCELLED;
      const isReturned =
        order.orderStatus === OrderStatusEnum.RETURNED ||
        order.orderStatus === OrderStatusEnum.RETURN_INITIATED;

      if (isCancelled || isReturned) {
        refundedAmount += order.grandTotal;
      } else {
        grossRevenue += order.grandTotal;
        subtotalRevenue += order.subtotal;
        deliveryFeeRevenue += order.deliveryFee;

        // Payment method breakdown for completed revenue
        const pm = order.paymentMethod;
        const existingPm = paymentMap.get(pm) || { amount: 0, count: 0 };
        existingPm.amount += order.grandTotal;
        existingPm.count += 1;
        paymentMap.set(pm, existingPm);
      }

      // Chart bucket
      const bucketKey = this.formatBucketKey(order.createdAt, groupBy);
      const existing = bucketMap.get(bucketKey) || {
        grossRevenue: 0,
        netRevenue: 0,
        deliveryFee: 0,
        refunds: 0,
      };

      if (isCancelled || isReturned) {
        existing.refunds += order.grandTotal;
      } else {
        existing.grossRevenue += order.grandTotal;
        existing.netRevenue += order.grandTotal;
        existing.deliveryFee += order.deliveryFee;
      }
      bucketMap.set(bucketKey, existing);
    }

    const netRevenue = Math.max(0, grossRevenue - refundedAmount);
    const validOrdersCount = orders.filter((o) => o.orderStatus !== OrderStatusEnum.CANCELLED).length;
    const averageRevenuePerOrder =
      validOrdersCount > 0 ? Number((grossRevenue / validOrdersCount).toFixed(2)) : 0;

    const previousPeriodRevenue = Number((prevOrders._sum.grandTotal ?? 0).toFixed(2));
    const growthRate =
      previousPeriodRevenue > 0
        ? Number((((grossRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100).toFixed(1))
        : 0;

    const chartData = Array.from(bucketMap.entries()).map(([date, data]) => ({
      date,
      label: date,
      grossRevenue: Number(data.grossRevenue.toFixed(2)),
      netRevenue: Number((data.grossRevenue - data.refunds).toFixed(2)),
      deliveryFee: Number(data.deliveryFee.toFixed(2)),
      refunds: Number(data.refunds.toFixed(2)),
    }));

    const revenueByPaymentMethod = Array.from(paymentMap.entries()).map(([method, data]) => ({
      method,
      revenue: Number(data.amount.toFixed(2)),
      transactionsCount: data.count,
      percentage:
        grossRevenue > 0 ? Number(((data.amount / grossRevenue) * 100).toFixed(1)) : 0,
    }));

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString(), groupBy },
        summary: {
          grossRevenue: Number(grossRevenue.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          subtotalRevenue: Number(subtotalRevenue.toFixed(2)),
          deliveryFeeRevenue: Number(deliveryFeeRevenue.toFixed(2)),
          refundedAmount: Number(refundedAmount.toFixed(2)),
          averageRevenuePerOrder,
          returnRequestsCount: returnCount,
        },
        periodComparison: {
          currentPeriodRevenue: Number(grossRevenue.toFixed(2)),
          previousPeriodRevenue,
          growthRatePercentage: growthRate,
        },
        chartData,
        revenueByPaymentMethod,
      },
    };
  }

  /**
   * GET /api/v1/admin/analytics/orders
   * Orders volume, status distribution, fulfillment rate, cancellation rate, hourly distribution
   */
  async getOrderAnalytics(dto: AnalyticsDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(dto);
    const groupBy = dto.groupBy || AnalyticsGroupByEnum.DAY;

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        orderStatus: true,
        grandTotal: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalOrders = orders.length;
    let deliveredCount = 0;
    let shippedCount = 0;
    let processingCount = 0;
    let cancelledCount = 0;
    let returnedCount = 0;

    const bucketMap = new Map<
      string,
      { totalOrders: number; delivered: number; inTransit: number; cancelled: number; returned: number }
    >();
    const statusMap = new Map<OrderStatusEnum, number>();
    const hourlyCounts = new Array(24).fill(0);

    for (const order of orders) {
      const st = order.orderStatus;
      statusMap.set(st, (statusMap.get(st) || 0) + 1);

      // Hourly distribution
      const hour = new Date(order.createdAt).getUTCHours();
      hourlyCounts[hour] += 1;

      if (st === OrderStatusEnum.DELIVERED) deliveredCount++;
      else if (st === OrderStatusEnum.SHIPPED || st === OrderStatusEnum.OUT_FOR_DELIVERY) shippedCount++;
      else if (st === OrderStatusEnum.PROCESSING || st === OrderStatusEnum.PACKED) processingCount++;
      else if (st === OrderStatusEnum.CANCELLED) cancelledCount++;
      else if (st === OrderStatusEnum.RETURNED || st === OrderStatusEnum.RETURN_INITIATED) returnedCount++;

      // Bucket
      const bucketKey = this.formatBucketKey(order.createdAt, groupBy);
      const existing = bucketMap.get(bucketKey) || {
        totalOrders: 0,
        delivered: 0,
        inTransit: 0,
        cancelled: 0,
        returned: 0,
      };
      existing.totalOrders += 1;
      if (st === OrderStatusEnum.DELIVERED) existing.delivered += 1;
      else if (st === OrderStatusEnum.SHIPPED || st === OrderStatusEnum.OUT_FOR_DELIVERY) existing.inTransit += 1;
      else if (st === OrderStatusEnum.CANCELLED) existing.cancelled += 1;
      else if (st === OrderStatusEnum.RETURNED || st === OrderStatusEnum.RETURN_INITIATED) existing.returned += 1;

      bucketMap.set(bucketKey, existing);
    }

    const fulfillmentRate =
      totalOrders > 0
        ? Number((((deliveredCount + shippedCount) / totalOrders) * 100).toFixed(1))
        : 0;
    const cancellationRate =
      totalOrders > 0 ? Number(((cancelledCount / totalOrders) * 100).toFixed(1)) : 0;
    const returnRate =
      totalOrders > 0 ? Number(((returnedCount / totalOrders) * 100).toFixed(1)) : 0;

    const chartData = Array.from(bucketMap.entries()).map(([date, data]) => ({
      date,
      label: date,
      ...data,
    }));

    const statusDistribution = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: totalOrders > 0 ? Number(((count / totalOrders) * 100).toFixed(1)) : 0,
    }));

    const hourlyDistribution = hourlyCounts.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      ordersCount: count,
    }));

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString(), groupBy },
        summary: {
          totalOrders,
          deliveredCount,
          shippedCount,
          processingCount,
          cancelledCount,
          returnedCount,
          fulfillmentRatePercentage: fulfillmentRate,
          cancellationRatePercentage: cancellationRate,
          returnRatePercentage: returnRate,
        },
        chartData,
        statusDistribution,
        hourlyDistribution,
      },
    };
  }

  /**
   * GET /api/v1/admin/analytics/customers
   * Customer acquisition, retention rate, new vs repeat segmentation, top spenders
   */
  async getCustomerAnalytics(dto: AnalyticsDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(dto);
    const groupBy = dto.groupBy || AnalyticsGroupByEnum.DAY;

    const [totalCustomers, newUsers, allOrders] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          orderStatus: { not: OrderStatusEnum.CANCELLED },
        },
        select: {
          userId: true,
          grandTotal: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    // Bucket new customer registrations
    const bucketMap = new Map<string, { newCustomers: number; activeOrderCustomers: number }>();
    for (const user of newUsers) {
      const bucketKey = this.formatBucketKey(user.createdAt, groupBy);
      const existing = bucketMap.get(bucketKey) || { newCustomers: 0, activeOrderCustomers: 0 };
      existing.newCustomers += 1;
      bucketMap.set(bucketKey, existing);
    }

    // Customer spend aggregation
    const customerSpendMap = new Map<
      string,
      { id: string; name: string; email: string | null; ordersCount: number; totalSpent: number; lastOrderDate: Date }
    >();

    for (const order of allOrders) {
      const uid = order.userId;
      const bucketKey = this.formatBucketKey(order.createdAt, groupBy);
      const existingBucket = bucketMap.get(bucketKey) || { newCustomers: 0, activeOrderCustomers: 0 };
      existingBucket.activeOrderCustomers += 1;
      bucketMap.set(bucketKey, existingBucket);

      const existingCust = customerSpendMap.get(uid) || {
        id: uid,
        name: order.user?.name || 'Customer',
        email: order.user?.email || null,
        ordersCount: 0,
        totalSpent: 0,
        lastOrderDate: order.createdAt,
      };
      existingCust.ordersCount += 1;
      existingCust.totalSpent += order.grandTotal;
      if (order.createdAt > existingCust.lastOrderDate) {
        existingCust.lastOrderDate = order.createdAt;
      }
      customerSpendMap.set(uid, existingCust);
    }

    const newCustomersCount = newUsers.length;
    const activeCustomersCount = customerSpendMap.size;
    const repeatCustomers = Array.from(customerSpendMap.values()).filter((c) => c.ordersCount > 1);
    const repeatCustomersCount = repeatCustomers.length;

    const retentionRate =
      activeCustomersCount > 0
        ? Number(((repeatCustomersCount / activeCustomersCount) * 100).toFixed(1))
        : 0;

    const totalSpentAll = Array.from(customerSpendMap.values()).reduce((sum, c) => sum + c.totalSpent, 0);
    const averageLifetimeValue =
      activeCustomersCount > 0 ? Number((totalSpentAll / activeCustomersCount).toFixed(2)) : 0;

    const chartData = Array.from(bucketMap.entries()).map(([date, data]) => ({
      date,
      label: date,
      newCustomers: data.newCustomers,
      activeOrderCustomers: data.activeOrderCustomers,
    }));

    const topCustomersBySpend = Array.from(customerSpendMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((c) => ({
        ...c,
        totalSpent: Number(c.totalSpent.toFixed(2)),
      }));

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString(), groupBy },
        summary: {
          totalCustomersInSystem: totalCustomers,
          newCustomersInPeriod: newCustomersCount,
          activeCustomersInPeriod: activeCustomersCount,
          repeatCustomersCount,
          customerRetentionRatePercentage: retentionRate,
          averageCustomerSpend: averageLifetimeValue,
        },
        segmentation: {
          newCustomers: newCustomersCount,
          repeatCustomers: repeatCustomersCount,
          oneTimeCustomers: activeCustomersCount - repeatCustomersCount,
        },
        chartData,
        topCustomersBySpend,
      },
    };
  }

  /**
   * GET /api/v1/admin/analytics/products
   * Best-selling products, category revenue shares, out-of-stock count, inventory health
   */
  async getProductAnalytics(dto: ProductAnalyticsQueryDto = {}) {
    const { from, to } = this.resolveDateRange(dto);
    const limit = dto.limit || 10;

    const [orderItems, totalActiveProducts, outOfStockCount, lowStockCount] =
      await Promise.all([
        this.prisma.orderItem.findMany({
          where: {
            order: {
              createdAt: { gte: from, lte: to },
              orderStatus: { not: OrderStatusEnum.CANCELLED },
            },
          },
        }),
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.product.count({ where: { stock: 0, deletedAt: null } }),
        this.prisma.product.count({ where: { stock: { gt: 0, lte: 10 }, deletedAt: null } }),
      ]);

    const distinctProductIds = Array.from(new Set(orderItems.map((i) => i.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: distinctProductIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        stock: true,
        category: { select: { id: true, name: true } },
        media: { take: 1, select: { url: true } },
      },
    });

    const productDetailsMap = new Map(products.map((p) => [p.id, p]));

    // Aggregate by product
    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        slug: string;
        imageUrl: string | null;
        categoryName: string;
        unitsSold: number;
        revenueGenerated: number;
        currentStock: number;
      }
    >();

    const categoryMap = new Map<string, { id: string; name: string; unitsSold: number; revenue: number }>();
    let totalUnitsSold = 0;
    let totalRevenue = 0;

    for (const item of orderItems) {
      totalUnitsSold += item.quantity;
      totalRevenue += item.totalPrice;

      const pid = item.productId;
      const p = productDetailsMap.get(pid);
      const existingP = productMap.get(pid) || {
        id: pid,
        name: item.productName || p?.name || 'Product',
        slug: p?.slug || '',
        imageUrl: p?.media[0]?.url || null,
        categoryName: p?.category?.name || 'Uncategorized',
        unitsSold: 0,
        revenueGenerated: 0,
        currentStock: p?.stock ?? 0,
      };
      existingP.unitsSold += item.quantity;
      existingP.revenueGenerated += item.totalPrice;
      productMap.set(pid, existingP);

      const catId = p?.category?.id || 'other';
      const catName = p?.category?.name || 'Uncategorized';
      const existingCat = categoryMap.get(catId) || {
        id: catId,
        name: catName,
        unitsSold: 0,
        revenue: 0,
      };
      existingCat.unitsSold += item.quantity;
      existingCat.revenue += item.totalPrice;
      categoryMap.set(catId, existingCat);
    }

    const topSellingProducts = Array.from(productMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, limit)
      .map((p) => ({
        ...p,
        revenueGenerated: Number(p.revenueGenerated.toFixed(2)),
      }));

    const topSellingCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({
        ...c,
        revenue: Number(c.revenue.toFixed(2)),
        percentage: totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      }));

    // Fetch low stock items for warnings
    const lowStockAlerts = await this.prisma.product.findMany({
      where: { stock: { lte: 10 }, deletedAt: null },
      take: 10,
      orderBy: { stock: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        stock: true,
        category: { select: { name: true } },
      },
    });

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalActiveProducts,
          outOfStockCount,
          lowStockCount,
          totalUnitsSoldInPeriod: totalUnitsSold,
          totalRevenueInPeriod: Number(totalRevenue.toFixed(2)),
          topPerformingProduct: topSellingProducts[0]?.name || null,
        },
        topSellingProducts,
        topSellingCategories,
        lowStockAlerts: lowStockAlerts.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          stock: p.stock,
          categoryName: p.category?.name || 'Uncategorized',
          status: p.stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        })),
      },
    };
  }
}
