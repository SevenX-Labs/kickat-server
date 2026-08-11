import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsDateRangeDto,
  ProductAnalyticsQueryDto,
} from './dto/admin-analytics.dto';

describe('Admin AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    getSalesAnalytics: jest.fn(),
    getRevenueAnalytics: jest.fn(),
    getOrderAnalytics: jest.fn(),
    getCustomerAnalytics: jest.fn(),
    getProductAnalytics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getSalesAnalytics should delegate to service', async () => {
    const expected = { success: true, data: { summary: {} } };
    mockAnalyticsService.getSalesAnalytics.mockResolvedValue(expected);

    const query: AnalyticsDateRangeDto = { dateFrom: '2026-08-01', dateTo: '2026-08-11' };
    const result = await controller.getSalesAnalytics(query);

    expect(result).toBe(expected);
    expect(mockAnalyticsService.getSalesAnalytics).toHaveBeenCalledWith(query);
  });

  it('getRevenueAnalytics should delegate to service', async () => {
    const expected = { success: true, data: { summary: {} } };
    mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(expected);

    const query: AnalyticsDateRangeDto = { dateFrom: '2026-08-01', dateTo: '2026-08-11' };
    const result = await controller.getRevenueAnalytics(query);

    expect(result).toBe(expected);
    expect(mockAnalyticsService.getRevenueAnalytics).toHaveBeenCalledWith(query);
  });

  it('getOrderAnalytics should delegate to service', async () => {
    const expected = { success: true, data: { summary: {} } };
    mockAnalyticsService.getOrderAnalytics.mockResolvedValue(expected);

    const query: AnalyticsDateRangeDto = { dateFrom: '2026-08-01', dateTo: '2026-08-11' };
    const result = await controller.getOrderAnalytics(query);

    expect(result).toBe(expected);
    expect(mockAnalyticsService.getOrderAnalytics).toHaveBeenCalledWith(query);
  });

  it('getCustomerAnalytics should delegate to service', async () => {
    const expected = { success: true, data: { summary: {} } };
    mockAnalyticsService.getCustomerAnalytics.mockResolvedValue(expected);

    const query: AnalyticsDateRangeDto = { dateFrom: '2026-08-01', dateTo: '2026-08-11' };
    const result = await controller.getCustomerAnalytics(query);

    expect(result).toBe(expected);
    expect(mockAnalyticsService.getCustomerAnalytics).toHaveBeenCalledWith(query);
  });

  it('getProductAnalytics should delegate to service', async () => {
    const expected = { success: true, data: { summary: {} } };
    mockAnalyticsService.getProductAnalytics.mockResolvedValue(expected);

    const query: ProductAnalyticsQueryDto = { limit: 10 };
    const result = await controller.getProductAnalytics(query);

    expect(result).toBe(expected);
    expect(mockAnalyticsService.getProductAnalytics).toHaveBeenCalledWith(query);
  });
});
