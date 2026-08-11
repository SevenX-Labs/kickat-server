import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdminAuth } from '../../../common';
import {
  ExportReportDto,
  OrdersReportQueryDto,
  ProductsReportQueryDto,
  ReportDateRangeDto,
} from './dto/admin-report.dto';
import type { Response } from 'express';

@AdminAuth()
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /api/v1/admin/reports/sales/export
   * Downloadable CSV or JSON export of sales ledger
   */
  @Get('sales/export')
  async exportSalesReport(
    @Query() query: ExportReportDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportSalesReport(query, res);
  }

  /**
   * GET /api/v1/admin/reports/sales
   * Tabular sales performance report
   */
  @Get('sales')
  async getSalesReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getSalesReport(query);
  }

  /**
   * GET /api/v1/admin/reports/orders
   * Order lifecycle and fulfillment report
   */
  @Get('orders')
  async getOrdersReport(@Query() query: OrdersReportQueryDto) {
    return this.reportsService.getOrdersReport(query);
  }

  /**
   * GET /api/v1/admin/reports/customers
   * Customer acquisition and LTV report
   */
  @Get('customers')
  async getCustomersReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getCustomersReport(query);
  }

  /**
   * GET /api/v1/admin/reports/products
   * Product inventory movement and sales report
   */
  @Get('products')
  async getProductsReport(@Query() query: ProductsReportQueryDto) {
    return this.reportsService.getProductsReport(query);
  }

  /**
   * GET /api/v1/admin/reports/refunds
   * Refund requests and returns ledger
   */
  @Get('refunds')
  async getRefundsReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getRefundsReport(query);
  }

  /**
   * GET /api/v1/admin/reports/gst
   * GST tax compliance report
   */
  @Get('gst')
  async getGstReport(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getGstReport(query);
  }
}
