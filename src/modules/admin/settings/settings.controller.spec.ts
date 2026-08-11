import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import {
  UpdateAllSettingsDto,
  UpdateDeliverySettingsDto,
  UpdateGeneralSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateStoreSettingsDto,
  UpdateTaxSettingsDto,
} from './dto/admin-settings.dto';

describe('Admin SettingsController', () => {
  let controller: SettingsController;
  let service: SettingsService;

  const mockSettingsService = {
    getAllSettings: jest.fn(),
    updateAllSettings: jest.fn(),
    getGeneralSettings: jest.fn(),
    updateGeneralSettings: jest.fn(),
    getStoreSettings: jest.fn(),
    updateStoreSettings: jest.fn(),
    getPaymentSettings: jest.fn(),
    updatePaymentSettings: jest.fn(),
    getTaxSettings: jest.fn(),
    updateTaxSettings: jest.fn(),
    getDeliverySettings: jest.fn(),
    updateDeliverySettings: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getAllSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getAllSettings.mockResolvedValue(expected);

    const result = await controller.getAllSettings();

    expect(result).toBe(expected);
    expect(mockSettingsService.getAllSettings).toHaveBeenCalled();
  });

  it('updateAllSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.updateAllSettings.mockResolvedValue(expected);

    const dto: UpdateAllSettingsDto = { general: { siteName: 'Kickat' } };
    const result = await controller.updateAllSettings(dto);

    expect(result).toBe(expected);
    expect(mockSettingsService.updateAllSettings).toHaveBeenCalledWith(dto);
  });

  it('getGeneralSettings & updateGeneralSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getGeneralSettings.mockResolvedValue(expected);
    mockSettingsService.updateGeneralSettings.mockResolvedValue(expected);

    const dto: UpdateGeneralSettingsDto = { siteName: 'Kickat' };
    expect(await controller.getGeneralSettings()).toBe(expected);
    expect(await controller.updateGeneralSettings(dto)).toBe(expected);
  });

  it('getStoreSettings & updateStoreSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getStoreSettings.mockResolvedValue(expected);
    mockSettingsService.updateStoreSettings.mockResolvedValue(expected);

    const dto: UpdateStoreSettingsDto = { storeName: 'Store' };
    expect(await controller.getStoreSettings()).toBe(expected);
    expect(await controller.updateStoreSettings(dto)).toBe(expected);
  });

  it('getPaymentSettings & updatePaymentSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getPaymentSettings.mockResolvedValue(expected);
    mockSettingsService.updatePaymentSettings.mockResolvedValue(expected);

    const dto: UpdatePaymentSettingsDto = { cod: { enabled: true } };
    expect(await controller.getPaymentSettings()).toBe(expected);
    expect(await controller.updatePaymentSettings(dto)).toBe(expected);
  });

  it('getTaxSettings & updateTaxSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getTaxSettings.mockResolvedValue(expected);
    mockSettingsService.updateTaxSettings.mockResolvedValue(expected);

    const dto: UpdateTaxSettingsDto = { standardGstRate: 18 };
    expect(await controller.getTaxSettings()).toBe(expected);
    expect(await controller.updateTaxSettings(dto)).toBe(expected);
  });

  it('getDeliverySettings & updateDeliverySettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getDeliverySettings.mockResolvedValue(expected);
    mockSettingsService.updateDeliverySettings.mockResolvedValue(expected);

    const dto: UpdateDeliverySettingsDto = { standardDeliveryFee: 50 };
    expect(await controller.getDeliverySettings()).toBe(expected);
    expect(await controller.updateDeliverySettings(dto)).toBe(expected);
  });
});
