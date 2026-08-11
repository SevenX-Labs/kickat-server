import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CampaignChannelEnum } from '@prisma/client';
import {
  AdminCampaignsQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/admin-campaign.dto';

describe('Admin NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockNotificationsService = {
    getCampaigns: jest.fn(),
    getCampaignById: jest.fn(),
    createCampaign: jest.fn(),
    updateCampaign: jest.fn(),
    deleteCampaign: jest.fn(),
    sendCampaign: jest.fn(),
    cancelCampaign: jest.fn(),
    getCampaignStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getCampaigns should delegate to service', async () => {
    const expected = { success: true, data: { campaigns: [] } };
    mockNotificationsService.getCampaigns.mockResolvedValue(expected);

    const query: AdminCampaignsQueryDto = { page: 1, limit: 10 };
    const result = await controller.getCampaigns(query);

    expect(result).toBe(expected);
    expect(mockNotificationsService.getCampaigns).toHaveBeenCalledWith(query);
  });

  it('getCampaignById should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockNotificationsService.getCampaignById.mockResolvedValue(expected);

    const result = await controller.getCampaignById('camp-1');

    expect(result).toBe(expected);
    expect(mockNotificationsService.getCampaignById).toHaveBeenCalledWith('camp-1');
  });

  it('createCampaign should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockNotificationsService.createCampaign.mockResolvedValue(expected);

    const dto: CreateCampaignDto = {
      name: 'Sale',
      channel: CampaignChannelEnum.EMAIL,
      message: 'Body',
    };
    const result = await controller.createCampaign(dto);

    expect(result).toBe(expected);
    expect(mockNotificationsService.createCampaign).toHaveBeenCalledWith(dto);
  });

  it('updateCampaign should delegate to service', async () => {
    const expected = { success: true, data: {} };
    mockNotificationsService.updateCampaign.mockResolvedValue(expected);

    const dto: UpdateCampaignDto = { name: 'Updated Sale' };
    const result = await controller.updateCampaign('camp-1', dto);

    expect(result).toBe(expected);
    expect(mockNotificationsService.updateCampaign).toHaveBeenCalledWith('camp-1', dto);
  });

  it('deleteCampaign should delegate to service', async () => {
    const expected = { success: true, message: 'Deleted' };
    mockNotificationsService.deleteCampaign.mockResolvedValue(expected);

    const result = await controller.deleteCampaign('camp-1');

    expect(result).toBe(expected);
    expect(mockNotificationsService.deleteCampaign).toHaveBeenCalledWith('camp-1');
  });

  it('sendCampaign should delegate to service', async () => {
    const expected = { success: true, message: 'Dispatched' };
    mockNotificationsService.sendCampaign.mockResolvedValue(expected);

    const result = await controller.sendCampaign('camp-1');

    expect(result).toBe(expected);
    expect(mockNotificationsService.sendCampaign).toHaveBeenCalledWith('camp-1');
  });

  it('cancelCampaign should delegate to service', async () => {
    const expected = { success: true, message: 'Cancelled' };
    mockNotificationsService.cancelCampaign.mockResolvedValue(expected);

    const result = await controller.cancelCampaign('camp-1');

    expect(result).toBe(expected);
    expect(mockNotificationsService.cancelCampaign).toHaveBeenCalledWith('camp-1');
  });

  it('getCampaignStats should delegate to service', async () => {
    const expected = { success: true, data: { sentCount: 100 } };
    mockNotificationsService.getCampaignStats.mockResolvedValue(expected);

    const result = await controller.getCampaignStats('camp-1');

    expect(result).toBe(expected);
    expect(mockNotificationsService.getCampaignStats).toHaveBeenCalledWith('camp-1');
  });
});
