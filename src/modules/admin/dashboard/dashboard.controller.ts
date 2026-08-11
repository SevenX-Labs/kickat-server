import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AdminAuth } from '../../../common';
import {
  DashboardQueryDto,
  LowStockQueryDto,
  RecentOrdersQueryDto,
  SalesChartQueryDto,
  TopCategoriesQueryDto,
} from './dto/dashboard-query.dto';

@AdminAuth()
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/admin/dashboard
   * Overall dashboard summary including all key metrics, charts, and recent activity
   */
  @Get()
  async getDashboardSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboardSummary(query);
  }

  /**
   * GET /api/v1/admin/dashboard/stats
   * High-level KPI summary cards and period comparisons
   */
  @Get('stats')
  async getStats(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getStats(query);
  }

  /**
   * GET /api/v1/admin/dashboard/sales-chart
   * Time-series revenue, orders, and items sales chart data
   */
  @Get('sales-chart')
  async getSalesChart(@Query() query: SalesChartQueryDto) {
    return this.dashboardService.getSalesChartData(query);
  }

  /**
   * GET /api/v1/admin/dashboard/recent-orders
   * Recent orders list with customer and items summary
   */
  @Get('recent-orders')
  async getRecentOrders(@Query() query: RecentOrdersQueryDto) {
    return this.dashboardService.getRecentOrders(query);
  }

  /**
   * GET /api/v1/admin/dashboard/order-status-summary
   * Breakdown of orders across all order lifecycle statuses
   */
  @Get('order-status-summary')
  async getOrderStatusSummary() {
    return this.dashboardService.getOrderStatusSummary();
  }

  /**
   * GET /api/v1/admin/dashboard/top-categories
   * Top-selling categories ranked by revenue and units sold
   */
  @Get('top-categories')
  async getTopCategories(@Query() query: TopCategoriesQueryDto) {
    return this.dashboardService.getTopSellingCategories(query);
  }

  /**
   * GET /api/v1/admin/dashboard/low-stock
   * Low-stock and out-of-stock products & variants alert list
   */
  @Get('low-stock')
  async getLowStock(@Query() query: LowStockQueryDto) {
    return this.dashboardService.getLowStockProducts(query);
  }
}
