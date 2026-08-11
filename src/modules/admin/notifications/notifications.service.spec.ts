import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CampaignAudienceEnum,
  CampaignChannelEnum,
  CampaignStatusEnum,
} from '@prisma/client';
import { AdminCampaignSortEnum, CreateCampaignDto } from './dto/admin-campaign.dto';

describe('Admin NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  const mockPrismaService = {
    campaign: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campaignLog: {
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCampaigns', () => {
    it('should return paginated campaigns list with summary counts', async () => {
      const mockCampaigns = [
        {
          id: 'camp-1',
          name: 'Monsoon Sale Offer',
          channel: CampaignChannelEnum.WHATSAPP,
          status: CampaignStatusEnum.DRAFT,
          audienceType: CampaignAudienceEnum.ALL_CUSTOMERS,
          createdAt: new Date(),
        },
      ];

      prisma.campaign.findMany.mockResolvedValue(mockCampaigns);
      prisma.campaign.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // draft
        .mockResolvedValueOnce(0) // scheduled
        .mockResolvedValueOnce(0) // processing
        .mockResolvedValueOnce(0) // completed
        .mockResolvedValueOnce(0); // cancelled

      const result = await service.getCampaigns({
        page: 1,
        limit: 10,
        channel: CampaignChannelEnum.WHATSAPP,
        sort: AdminCampaignSortEnum.CREATED_AT_DESC,
      });

      expect(result.success).toBe(true);
      expect(result.data.campaigns.length).toBe(1);
      expect(result.data.summary.totalCampaigns).toBe(1);
      expect(result.data.summary.draftCount).toBe(1);
    });
  });

  describe('getCampaignById', () => {
    it('should return campaign details by ID', async () => {
      const mockCampaign = {
        id: 'camp-1',
        name: 'Festive Email Blast',
        channel: CampaignChannelEnum.EMAIL,
        logs: [],
      };

      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);

      const result = await service.getCampaignById('camp-1');

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Festive Email Blast');
    });

    it('should throw NotFoundException if campaign is not found', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.getCampaignById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCampaign', () => {
    it('should create campaign and resolve audience size', async () => {
      prisma.user.count.mockResolvedValue(250);
      prisma.campaign.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'camp-new', ...data }),
      );

      const dto: CreateCampaignDto = {
        name: 'New Year Offer',
        channel: CampaignChannelEnum.SMS,
        message: 'Get 20% off on your next order!',
        audienceType: CampaignAudienceEnum.ALL_CUSTOMERS,
      };

      const result = await service.createCampaign(dto);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Year Offer');
      expect(result.data.status).toBe(CampaignStatusEnum.DRAFT);
      expect(result.data.totalTarget).toBe(250);
    });
  });

  describe('updateCampaign', () => {
    it('should update campaign when in DRAFT or SCHEDULED state', async () => {
      const mockCampaign = { id: 'camp-1', status: CampaignStatusEnum.DRAFT, audienceType: 'ALL_CUSTOMERS' };
      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);
      prisma.user.count.mockResolvedValue(100);
      prisma.campaign.update.mockResolvedValue({
        ...mockCampaign,
        name: 'Updated Name',
      });

      const result = await service.updateCampaign('camp-1', {
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Name');
    });

    it('should throw BadRequestException when updating a PROCESSING campaign', async () => {
      const mockCampaign = { id: 'camp-1', status: CampaignStatusEnum.PROCESSING };
      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);

      await expect(
        service.updateCampaign('camp-1', { name: 'Updated Name' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendCampaign', () => {
    it('should dispatch campaign and generate delivery logs', async () => {
      const mockCampaign = {
        id: 'camp-1',
        name: 'Flash Sale',
        channel: CampaignChannelEnum.EMAIL,
        status: CampaignStatusEnum.DRAFT,
        totalTarget: 2,
      };

      const mockUsers = [
        { id: 'u1', email: 'user1@example.com', phone: '+919876543210' },
        { id: 'u2', email: 'user2@example.com', phone: '+919876543211' },
      ];

      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);
      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.campaignLog.createMany.mockResolvedValue({ count: 2 });
      prisma.campaign.update.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatusEnum.COMPLETED,
        sentCount: 2,
      });

      const result = await service.sendCampaign('camp-1');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(CampaignStatusEnum.COMPLETED);
      expect(prisma.campaignLog.createMany).toHaveBeenCalled();
    });
  });

  describe('cancelCampaign', () => {
    it('should cancel active or scheduled campaign', async () => {
      const mockCampaign = { id: 'camp-1', status: CampaignStatusEnum.SCHEDULED };
      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);
      prisma.campaign.update.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatusEnum.CANCELLED,
      });

      const result = await service.cancelCampaign('camp-1');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(CampaignStatusEnum.CANCELLED);
    });
  });

  describe('getCampaignStats', () => {
    it('should calculate real-time campaign delivery statistics', async () => {
      const mockCampaign = {
        id: 'camp-1',
        name: 'Flash Sale',
        channel: CampaignChannelEnum.WHATSAPP,
        status: CampaignStatusEnum.COMPLETED,
        totalTarget: 100,
        sentCount: 100,
        deliveredCount: 95,
        failedCount: 5,
        pendingCount: 0,
      };

      prisma.campaign.findFirst.mockResolvedValue(mockCampaign);
      prisma.campaignLog.groupBy.mockResolvedValue([
        { status: 'DELIVERED', _count: { id: 95 } },
        { status: 'FAILED', _count: { id: 5 } },
      ]);

      const result = await service.getCampaignStats('camp-1');

      expect(result.success).toBe(true);
      expect(result.data.deliveredCount).toBe(95);
      expect(result.data.failedCount).toBe(5);
      expect(result.data.deliveryRatePercentage).toBe(95);
    });
  });
});
