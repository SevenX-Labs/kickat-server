import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AdminAuth } from '../../../common';
import {
  AnalyticsDateRangeDto,
  ProductAnalyticsQueryDto,
} from './dto/admin-analytics.dto';

@AdminAuth()
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/v1/admin/analytics/sales
   * Sales performance trends, units sold, and AOV
   */
  @Get('sales')
  async getSalesAnalytics(@Query() query: AnalyticsDateRangeDto) {
    return this.analyticsService.getSalesAnalytics(query);
  }

  /**
   * GET /api/v1/admin/analytics/revenue
   * Gross & net revenue, refunds, and period comparisons
   */
  @Get('revenue')
  async getRevenueAnalytics(@Query() query: AnalyticsDateRangeDto) {
    return this.analyticsService.getRevenueAnalytics(query);
  }

  /**
   * GET /api/v1/admin/analytics/orders
   * Order volume, lifecycle status distribution, and hourly heatmaps
   */
  @Get('orders')
  async getOrderAnalytics(@Query() query: AnalyticsDateRangeDto) {
    return this.analyticsService.getOrderAnalytics(query);
  }

  /**
   * GET /api/v1/admin/analytics/customers
   * Customer acquisition trends, retention rate, and top spenders
   */
  @Get('customers')
  async getCustomerAnalytics(@Query() query: AnalyticsDateRangeDto) {
    return this.analyticsService.getCustomerAnalytics(query);
  }

  /**
   * GET /api/v1/admin/analytics/products
   * Best-selling products, category revenue, and inventory health
   */
  @Get('products')
  async getProductAnalytics(@Query() query: ProductAnalyticsQueryDto) {
    return this.analyticsService.getProductAnalytics(query);
  }
}
