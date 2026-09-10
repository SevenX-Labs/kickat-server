import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController, PublicSettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import {
  UpdateAllSettingsDto,
  UpdateDeliverySettingsDto,
  UpdateGeneralSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateTaxSettingsDto,
} from './dto/admin-settings.dto';

describe('Admin SettingsController & PublicSettingsController', () => {
  let controller: SettingsController;
  let publicController: PublicSettingsController;
  let service: SettingsService;

  const mockSettingsService = {
    getAllSettings: jest.fn(),
    updateAllSettings: jest.fn(),
    getGeneralSettings: jest.fn(),
    updateGeneralSettings: jest.fn(),
    getPaymentSettings: jest.fn(),
    updatePaymentSettings: jest.fn(),
    getTaxSettings: jest.fn(),
    updateTaxSettings: jest.fn(),
    getDeliverySettings: jest.fn(),
    updateDeliverySettings: jest.fn(),
    getPublicGeneralSettings: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController, PublicSettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
    publicController = module.get<PublicSettingsController>(PublicSettingsController);
    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(publicController).toBeDefined();
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

    const dto: UpdateAllSettingsDto = { general: { supportEmail: 'support@kickat.co.in' } };
    const result = await controller.updateAllSettings(dto);

    expect(result).toBe(expected);
    expect(mockSettingsService.updateAllSettings).toHaveBeenCalledWith(dto);
  });

  it('getGeneralSettings & updateGeneralSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getGeneralSettings.mockResolvedValue(expected);
    mockSettingsService.updateGeneralSettings.mockResolvedValue(expected);

    const dto: UpdateGeneralSettingsDto = { supportEmail: 'support@kickat.co.in' };
    expect(await controller.getGeneralSettings()).toBe(expected);
    expect(await controller.updateGeneralSettings(dto)).toBe(expected);
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

    const dto: UpdateTaxSettingsDto = { gstEnabled: true, gstPercentage: 18 };
    expect(await controller.getTaxSettings()).toBe(expected);
    expect(await controller.updateTaxSettings(dto)).toBe(expected);
  });

  it('getDeliverySettings & updateDeliverySettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getDeliverySettings.mockResolvedValue(expected);
    mockSettingsService.updateDeliverySettings.mockResolvedValue(expected);

    const dto: UpdateDeliverySettingsDto = { deliveryFeeEnabled: true, deliveryFee: 50 };
    expect(await controller.getDeliverySettings()).toBe(expected);
    expect(await controller.updateDeliverySettings(dto)).toBe(expected);
  });

  it('getPublicSettings should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockSettingsService.getPublicGeneralSettings.mockResolvedValue(expected);

    expect(await publicController.getPublicSettings()).toBe(expected);
  });
});
