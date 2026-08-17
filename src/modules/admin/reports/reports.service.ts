import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ExportReportDto,
  OrdersReportQueryDto,
  ProductsReportQueryDto,
  ReportDateRangeDto,
} from './dto/admin-report.dto';
import { OrderStatusEnum, PaymentStatusEnum } from '@prisma/client';
import { Response } from 'express';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to parse and resolve date range defaults
   */
  private resolveDateRange(dto: { dateFrom?: string; dateTo?: string }) {
    const to = dto.dateTo ? new Date(dto.dateTo) : new Date();
    const from = dto.dateFrom
      ? new Date(dto.dateFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    return { from, to };
  }

  /**
   * GET /api/v1/admin/reports/sales
   * Tabular sales report with AOV, units sold, and summary
   */
  async getSalesReport(query: ReportDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      createdAt: { gte: from, lte: to },
      orderStatus: { not: OrderStatusEnum.CANCELLED },
    };

    const [orders, total, aggregateData, totalUnitsAgg] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          items: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: { grandTotal: true, subtotal: true, deliveryFee: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: where },
        _sum: { quantity: true },
      }),
    ]);

    const formattedData = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName} x${i.quantity}`)
        .join(', ');

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        customerName: order.user?.name || 'Customer',
        customerEmail: order.user?.email || null,
        customerPhone: order.user?.phone || null,
        itemsCount,
        itemsSummary,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        grandTotal: order.grandTotal,
      };
    });

    const totalSales = Number((aggregateData._sum.grandTotal ?? 0).toFixed(2));
    const totalSubtotal = Number((aggregateData._sum.subtotal ?? 0).toFixed(2));
    const totalDeliveryFees = Number((aggregateData._sum.deliveryFee ?? 0).toFixed(2));
    const totalUnitsSold = totalUnitsAgg._sum.quantity ?? 0;
    const averageOrderValue = total > 0 ? Number((totalSales / total).toFixed(2)) : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalSales,
          totalSubtotal,
          totalDeliveryFees,
          totalOrders: total,
          totalUnitsSold,
          averageOrderValue,
        },
        records: formattedData,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reports/sales/export
   * Export sales report as CSV or JSON
   */
  async exportSalesReport(query: ExportReportDto = {}, res?: Response) {
    const { from, to } = this.resolveDateRange(query);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        orderStatus: { not: OrderStatusEnum.CANCELLED },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        items: true,
      },
    });

    const records = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName} (${i.quantity})`)
        .join('; ');

      return {
        orderNumber: order.orderNumber,
        date: order.createdAt.toISOString().split('T')[0],
        customerName: order.user?.name || 'Customer',
        customerEmail: order.user?.email || '',
        customerPhone: order.user?.phone || '',
        itemsCount,
        itemsSummary,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        grandTotal: order.grandTotal,
      };
    });

    if (query.format === 'json') {
      return {
        success: true,
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        totalRecords: records.length,
        records,
      };
    }

    // CSV format
    const headers = [
      'Order Number',
      'Date',
      'Customer Name',
      'Email',
      'Phone',
      'Items Count',
      'Items Summary',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Subtotal',
      'Delivery Fee',
      'Grand Total',
    ];

    const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const csvRows = [
      headers.join(','),
      ...records.map((r) =>
        [
          escapeCsv(r.orderNumber),
          escapeCsv(r.date),
          escapeCsv(r.customerName),
          escapeCsv(r.customerEmail),
          escapeCsv(r.customerPhone),
          r.itemsCount,
          escapeCsv(r.itemsSummary),
          escapeCsv(r.paymentMethod),
          escapeCsv(r.paymentStatus),
          escapeCsv(r.orderStatus),
          r.subtotal,
          r.deliveryFee,
          r.grandTotal,
        ].join(','),
      ),
    ];

    const csvString = csvRows.join('\r\n');

    if (res) {
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sales-report-${fromStr}-to-${toStr}.csv"`,
      );
      res.send(csvString);
      return;
    }

    return csvString;
  }

  /**
   * GET /api/v1/admin/reports/orders
   * Comprehensive order fulfillment and tracking report
   */
  async getOrdersReport(query: OrdersReportQueryDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      createdAt: { gte: from, lte: to },
      ...(query.status && { orderStatus: query.status }),
    };

    const [
      orders,
      total,
      revenueAgg,
      deliveredCount,
      processingCount,
      shippedCount,
      cancelledCount,
      returnedCount,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          address: true,
          items: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: { ...where, orderStatus: { not: OrderStatusEnum.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.DELIVERED } }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.PROCESSING, OrderStatusEnum.PACKED] },
        },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.SHIPPED, OrderStatusEnum.OUT_FOR_DELIVERY] },
        },
      }),
      this.prisma.order.count({ where: { ...where, orderStatus: OrderStatusEnum.CANCELLED } }),
      this.prisma.order.count({
        where: {
          ...where,
          orderStatus: { in: [OrderStatusEnum.RETURNED, OrderStatusEnum.RETURN_INITIATED] },
        },
      }),
    ]);

    const formatted = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName} x${i.quantity}`)
        .join(', ');
      const destination = `${order.address?.houseFlat || ''} ${order.address?.buildingStreet || ''}, ${order.address?.city || ''} - ${order.address?.pincode || ''}`.trim();

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        customerName: order.user?.name || 'Customer',
        customerPhone: order.user?.phone || null,
        destination,
        orderStatus: order.orderStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        courierPartner: order.courierPartner || 'Unassigned',
        trackingNumber: order.trackingNumber || null,
        itemsCount,
        itemsSummary,
        grandTotal: order.grandTotal,
      };
    });

    const fulfillmentRate =
      total > 0
        ? Number((((deliveredCount + shippedCount) / total) * 100).toFixed(1))
        : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalOrders: total,
          totalRevenue: Number((revenueAgg._sum.grandTotal ?? 0).toFixed(2)),
          deliveredCount,
          processingCount,
          shippedCount,
          cancelledCount,
          returnedCount,
          fulfillmentRatePercentage: fulfillmentRate,
        },
        records: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reports/customers
   * Customer acquisition, spend history, and LTV report
   */
  async getCustomersReport(query: ReportDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [users, total, newInPeriod] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isBlocked: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          createdAt: true,
          _count: { select: { orders: true, pets: true } },
          orders: {
            where: { orderStatus: { not: OrderStatusEnum.CANCELLED } },
            select: { grandTotal: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    ]);

    const formatted = users.map((user) => {
      const totalSpent = user.orders.reduce((sum, o) => sum + o.grandTotal, 0);
      const ordersCount = user._count.orders;
      const validOrdersCount = user.orders.length;
      const aov = validOrdersCount > 0 ? Number((totalSpent / validOrdersCount).toFixed(2)) : 0;
      const lastOrderDate = user.orders[0]?.createdAt || null;

      return {
        customerId: user.id,
        name: user.name || 'Customer',
        email: user.email || null,
        phone: user.phone || null,
        isBlocked: user.isBlocked,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        registeredDate: user.createdAt,
        totalOrders: ordersCount,
        validOrdersCount,
        totalSpent: Number(totalSpent.toFixed(2)),
        averageOrderValue: aov,
        petsCount: user._count.pets,
        lastOrderDate,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalCustomers: total,
          newCustomersInPeriod: newInPeriod,
        },
        records: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reports/products
   * Product inventory performance and movement report
   */
  async getProductsReport(query: ProductsReportQueryDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const productWhere: any = {
      deletedAt: null,
      ...(query.categoryId && { categoryId: query.categoryId }),
    };

    const [products, total, orderItems] = await Promise.all([
      this.prisma.product.findMany({
        where: productWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.product.count({ where: productWhere }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: from, lte: to },
            orderStatus: { not: OrderStatusEnum.CANCELLED },
          },
        },
        select: {
          productId: true,
          quantity: true,
          totalPrice: true,
        },
      }),
    ]);

    // Map units sold and revenue per product in period
    const salesMap = new Map<string, { unitsSold: number; revenue: number }>();
    for (const item of orderItems) {
      const existing = salesMap.get(item.productId) || { unitsSold: 0, revenue: 0 };
      existing.unitsSold += item.quantity;
      existing.revenue += item.totalPrice;
      salesMap.set(item.productId, existing);
    }

    const formatted = products.map((product) => {
      const sales = salesMap.get(product.id) || { unitsSold: 0, revenue: 0 };
      const avgPrice = sales.unitsSold > 0 ? Number((sales.revenue / sales.unitsSold).toFixed(2)) : product.price;

      return {
        productId: product.id,
        productName: product.name,
        slug: product.slug,
        categoryName: product.category?.name || 'Uncategorized',
        currentStock: product.stock,
        stockStatus: product.stock === 0 ? 'OUT_OF_STOCK' : product.stock <= 10 ? 'LOW_STOCK' : 'IN_STOCK',
        unitsSoldInPeriod: sales.unitsSold,
        revenueGenerated: Number(sales.revenue.toFixed(2)),
        averageSellingPrice: avgPrice,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalProducts: total,
          totalUnitsSoldInPeriod: orderItems.reduce((sum, i) => sum + i.quantity, 0),
          totalRevenueInPeriod: Number(orderItems.reduce((sum, i) => sum + i.totalPrice, 0).toFixed(2)),
        },
        records: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reports/refunds
   * Return requests and refunds ledger
   */
  async getRefundsReport(query: ReportDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      createdAt: { gte: from, lte: to },
    };

    const [returns, total, refundedOrdersAgg] = await Promise.all([
      this.prisma.orderReturn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              grandTotal: true,
              user: { select: { name: true, email: true } },
            },
          },
          items: {
            include: {
              orderItem: {
                select: { productName: true, quantity: true },
              },
            },
          },
        },
      }),
      this.prisma.orderReturn.count({ where }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: from, lte: to },
          orderStatus: { in: [OrderStatusEnum.RETURNED, OrderStatusEnum.CANCELLED] },
        },
        _sum: { grandTotal: true },
      }),
    ]);

    const formatted = returns.map((ret) => {
      const itemsCount = ret.items.reduce((sum, i) => sum + (i.orderItem?.quantity || 1), 0);
      const itemsSummary = ret.items
        .map((i) => `${i.orderItem?.productName || 'Item'} (${i.reason})`)
        .join(', ');
      const primaryReason = ret.items[0]?.reason || 'Customer Return';

      return {
        returnId: ret.id,
        returnNumber: `RET-${ret.id.substring(0, 8).toUpperCase()}`,
        orderId: ret.orderId,
        orderNumber: ret.order.orderNumber,
        customerName: ret.order.user?.name || 'Customer',
        customerEmail: ret.order.user?.email || null,
        requestDate: ret.createdAt,
        reason: primaryReason,
        status: ret.status,
        refundAmount: ret.order.grandTotal,
        itemsCount,
        itemsSummary,
      };
    });

    const totalRefundAmount = refundedOrdersAgg._sum.grandTotal ?? 0;
    const averageRefund = total > 0 ? Number((totalRefundAmount / total).toFixed(2)) : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalRefundRequests: total,
          totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
          averageRefundAmount: averageRefund,
        },
        records: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/reports/gst
   * GST tax compliance report with CGST, SGST, IGST breakdown
   */
  async getGstReport(query: ReportDateRangeDto = {}) {
    const { from, to } = this.resolveDateRange(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      createdAt: { gte: from, lte: to },
      orderStatus: { not: OrderStatusEnum.CANCELLED },
    };

    const [orders, total, aggregates] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
          address: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: { subtotal: true, grandTotal: true },
      }),
    ]);

    const taxRate = 0.18; // 18% standard GST

    const formattedInvoices = orders.map((order) => {
      const taxableAmount = order.subtotal;
      const totalTax = Number((taxableAmount * taxRate).toFixed(2));
      const state = (order.address?.state || 'Maharashtra').toLowerCase();
      const isInterState = !state.includes('maharashtra') && !state.includes('mh');

      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;

      if (isInterState) {
        igstAmount = totalTax;
      } else {
        cgstAmount = Number((totalTax / 2).toFixed(2));
        sgstAmount = Number((totalTax / 2).toFixed(2));
      }

      return {
        invoiceNumber: `INV-${order.orderNumber}`,
        orderNumber: order.orderNumber,
        invoiceDate: order.createdAt,
        customerName: order.user?.name || 'Customer',
        state: order.address?.state || 'Maharashtra',
        isInterState,
        taxableAmount,
        gstRate: '18%',
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTaxAmount: totalTax,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
      };
    });

    const totalTaxable = Number((aggregates._sum.subtotal ?? 0).toFixed(2));
    const totalGst = Number((totalTaxable * taxRate).toFixed(2));
    const totalCgst = Number((totalGst / 2).toFixed(2));
    const totalSgst = Number((totalGst / 2).toFixed(2));
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalInvoicesCount: total,
          totalTaxableValue: totalTaxable,
          totalGstCollected: totalGst,
          totalCgstCollected: totalCgst,
          totalSgstCollected: totalSgst,
          totalIgstCollected: 0,
          totalInvoiceValue: Number((aggregates._sum.grandTotal ?? 0).toFixed(2)),
        },
        records: formattedInvoices,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }
}
