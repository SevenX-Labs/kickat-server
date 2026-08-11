import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardPeriodEnum } from './dto/dashboard-query.dto';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: DashboardService;

  const mockDashboardService = {
    getDashboardSummary: jest.fn(),
    getStats: jest.fn(),
    getSalesChartData: jest.fn(),
    getRecentOrders: jest.fn(),
    getOrderStatusSummary: jest.fn(),
    getTopSellingCategories: jest.fn(),
    getLowStockProducts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getDashboardSummary should delegate to service', async () => {
    const expected = { success: true, data: {} as any };
    mockDashboardService.getDashboardSummary.mockResolvedValue(expected);

    const query = { period: DashboardPeriodEnum.SEVEN_DAYS };
    const result = await controller.getDashboardSummary(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getDashboardSummary).toHaveBeenCalledWith(query);
  });

  it('getStats should delegate to service', async () => {
    const expected = { totalRevenue: 1000, totalOrders: 10 };
    mockDashboardService.getStats.mockResolvedValue(expected);

    const query = { period: DashboardPeriodEnum.TODAY };
    const result = await controller.getStats(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getStats).toHaveBeenCalledWith(query);
  });

  it('getSalesChart should delegate to service', async () => {
    const expected = { period: '7d', chartData: [] };
    mockDashboardService.getSalesChartData.mockResolvedValue(expected);

    const query = { period: DashboardPeriodEnum.SEVEN_DAYS };
    const result = await controller.getSalesChart(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getSalesChartData).toHaveBeenCalledWith(query);
  });

  it('getRecentOrders should delegate to service', async () => {
    const expected = { total: 0, orders: [] };
    mockDashboardService.getRecentOrders.mockResolvedValue(expected);

    const query = { limit: 5 };
    const result = await controller.getRecentOrders(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getRecentOrders).toHaveBeenCalledWith(query);
  });

  it('getOrderStatusSummary should delegate to service', async () => {
    const expected = { totalOrders: 10, breakdown: [] };
    mockDashboardService.getOrderStatusSummary.mockResolvedValue(expected);

    const result = await controller.getOrderStatusSummary();

    expect(result).toBe(expected);
    expect(mockDashboardService.getOrderStatusSummary).toHaveBeenCalled();
  });

  it('getTopCategories should delegate to service', async () => {
    const expected = { totalCategories: 2, categories: [] };
    mockDashboardService.getTopSellingCategories.mockResolvedValue(expected);

    const query = { limit: 5 };
    const result = await controller.getTopCategories(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getTopSellingCategories).toHaveBeenCalledWith(query);
  });

  it('getLowStock should delegate to service', async () => {
    const expected = { threshold: 10, items: [] };
    mockDashboardService.getLowStockProducts.mockResolvedValue(expected);

    const query = { threshold: 5, limit: 10 };
    const result = await controller.getLowStock(query);

    expect(result).toBe(expected);
    expect(mockDashboardService.getLowStockProducts).toHaveBeenCalledWith(query);
  });
});
