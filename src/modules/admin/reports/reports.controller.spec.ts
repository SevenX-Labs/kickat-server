import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import {
  ExportReportDto,
  OrdersReportQueryDto,
  ProductsReportQueryDto,
  ReportDateRangeDto,
} from './dto/admin-report.dto';

describe('Admin ReportsController', () => {
  let controller: ReportsController;
  let service: ReportsService;

  const mockReportsService = {
    getSalesReport: jest.fn(),
    exportSalesReport: jest.fn(),
    getOrdersReport: jest.fn(),
    getCustomersReport: jest.fn(),
    getProductsReport: jest.fn(),
    getRefundsReport: jest.fn(),
    getGstReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getSalesReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getSalesReport.mockResolvedValue(expected);

    const query: ReportDateRangeDto = { page: 1, limit: 10 };
    const result = await controller.getSalesReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getSalesReport).toHaveBeenCalledWith(query);
  });

  it('exportSalesReport should delegate to service', async () => {
    const expected = 'CSV,TEXT';
    mockReportsService.exportSalesReport.mockResolvedValue(expected);

    const query: ExportReportDto = { format: 'csv' };
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    const result = await controller.exportSalesReport(query, res);

    expect(result).toBe(expected);
    expect(mockReportsService.exportSalesReport).toHaveBeenCalledWith(query, res);
  });

  it('getOrdersReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getOrdersReport.mockResolvedValue(expected);

    const query: OrdersReportQueryDto = { page: 1, limit: 10 };
    const result = await controller.getOrdersReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getOrdersReport).toHaveBeenCalledWith(query);
  });

  it('getCustomersReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getCustomersReport.mockResolvedValue(expected);

    const query: ReportDateRangeDto = { page: 1, limit: 10 };
    const result = await controller.getCustomersReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getCustomersReport).toHaveBeenCalledWith(query);
  });

  it('getProductsReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getProductsReport.mockResolvedValue(expected);

    const query: ProductsReportQueryDto = { page: 1, limit: 10 };
    const result = await controller.getProductsReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getProductsReport).toHaveBeenCalledWith(query);
  });

  it('getRefundsReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getRefundsReport.mockResolvedValue(expected);

    const query: ReportDateRangeDto = { page: 1, limit: 10 };
    const result = await controller.getRefundsReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getRefundsReport).toHaveBeenCalledWith(query);
  });

  it('getGstReport should delegate to service', async () => {
    const expected = { success: true, data: { records: [] } };
    mockReportsService.getGstReport.mockResolvedValue(expected);

    const query: ReportDateRangeDto = { page: 1, limit: 10 };
    const result = await controller.getGstReport(query);

    expect(result).toBe(expected);
    expect(mockReportsService.getGstReport).toHaveBeenCalledWith(query);
  });
});
