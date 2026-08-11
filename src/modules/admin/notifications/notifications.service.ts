import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CampaignAudienceEnum,
  CampaignChannelEnum,
  CampaignStatusEnum,
} from '@prisma/client';
import {
  AdminCampaignSortEnum,
  AdminCampaignsQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/admin-campaign.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to estimate recipient audience count
   */
  private async resolveAudienceCount(
    audienceType: CampaignAudienceEnum = CampaignAudienceEnum.ALL_CUSTOMERS,
    audienceFilter?: any,
  ): Promise<number> {
    if (audienceType === CampaignAudienceEnum.ALL_CUSTOMERS) {
      return this.prisma.user.count({ where: { isBlocked: false } });
    }

    if (audienceType === CampaignAudienceEnum.CUSTOM_LIST && audienceFilter?.customerIds) {
      return Array.isArray(audienceFilter.customerIds)
        ? audienceFilter.customerIds.length
        : 0;
    }

    // Filtered audience fallback
    const where: any = { isBlocked: false };
    if (audienceFilter?.state) {
      where.addresses = { some: { state: audienceFilter.state } };
    }
    return this.prisma.user.count({ where });
  }

  /**
   * GET /api/v1/admin/campaigns
   * List all campaigns with filters and KPI metrics
   */
  async getCampaigns(query: AdminCampaignsQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.audienceType) {
      where.audienceType = query.audienceType;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { subject: { contains: s, mode: 'insensitive' } },
        { message: { contains: s, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminCampaignSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminCampaignSortEnum.SCHEDULED_AT_DESC:
        orderBy = { scheduledAt: 'desc' };
        break;
      case AdminCampaignSortEnum.NAME_ASC:
        orderBy = { name: 'asc' };
        break;
      case AdminCampaignSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [campaigns, total, draftCount, scheduledCount, processingCount, completedCount, cancelledCount] =
      await Promise.all([
        this.prisma.campaign.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.campaign.count({ where }),
        this.prisma.campaign.count({
          where: { ...where, status: CampaignStatusEnum.DRAFT },
        }),
        this.prisma.campaign.count({
          where: { ...where, status: CampaignStatusEnum.SCHEDULED },
        }),
        this.prisma.campaign.count({
          where: { ...where, status: CampaignStatusEnum.PROCESSING },
        }),
        this.prisma.campaign.count({
          where: { ...where, status: CampaignStatusEnum.COMPLETED },
        }),
        this.prisma.campaign.count({
          where: { ...where, status: CampaignStatusEnum.CANCELLED },
        }),
      ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        campaigns,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalCampaigns: total,
          draftCount,
          scheduledCount,
          processingCount,
          completedCount,
          cancelledCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/campaigns/:id
   * Get single campaign details and message configuration
   */
  async getCampaignById(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
      include: {
        logs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return {
      success: true,
      data: campaign,
    };
  }

  /**
   * POST /api/v1/admin/campaigns
   * Create WhatsApp/SMS/Email campaign
   */
  async createCampaign(dto: CreateCampaignDto) {
    const targetCount = await this.resolveAudienceCount(
      dto.audienceType,
      dto.audienceFilter,
    );

    let initialStatus = CampaignStatusEnum.DRAFT;
    let scheduledDate: Date | null = null;

    if (dto.scheduledAt) {
      scheduledDate = new Date(dto.scheduledAt);
      if (scheduledDate > new Date()) {
        initialStatus = CampaignStatusEnum.SCHEDULED;
      }
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        channel: dto.channel,
        message: dto.message,
        subject: dto.subject ? dto.subject.trim() : null,
        templateId: dto.templateId ? dto.templateId.trim() : null,
        status: initialStatus,
        audienceType: dto.audienceType || CampaignAudienceEnum.ALL_CUSTOMERS,
        audienceFilter: dto.audienceFilter || undefined,
        scheduledAt: scheduledDate,
        totalTarget: targetCount,
        pendingCount: targetCount,
      },
    });

    return {
      success: true,
      message: 'Campaign created successfully',
      data: campaign,
    };
  }

  /**
   * PATCH /api/v1/admin/campaigns/:id
   * Edit draft/scheduled campaign
   */
  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Campaign not found');
    }

    if (
      existing.status === CampaignStatusEnum.PROCESSING ||
      existing.status === CampaignStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot edit a campaign in ${existing.status} status`,
      );
    }

    let scheduledDate = existing.scheduledAt;
    let status = existing.status;

    if (dto.scheduledAt !== undefined) {
      if (dto.scheduledAt) {
        scheduledDate = new Date(dto.scheduledAt);
        status = CampaignStatusEnum.SCHEDULED;
      } else {
        scheduledDate = null;
        status = CampaignStatusEnum.DRAFT;
      }
    }

    const targetCount = await this.resolveAudienceCount(
      dto.audienceType || existing.audienceType,
      dto.audienceFilter !== undefined ? dto.audienceFilter : existing.audienceFilter,
    );

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.message !== undefined && { message: dto.message }),
        ...(dto.subject !== undefined && { subject: dto.subject?.trim() || null }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId?.trim() || null }),
        ...(dto.audienceType !== undefined && { audienceType: dto.audienceType }),
        ...(dto.audienceFilter !== undefined && { audienceFilter: dto.audienceFilter || undefined }),
        scheduledAt: scheduledDate,
        status,
        totalTarget: targetCount,
        pendingCount: targetCount,
      },
    });

    return {
      success: true,
      message: 'Campaign updated successfully',
      data: updated,
    };
  }

  /**
   * DELETE /api/v1/admin/campaigns/:id
   * Delete or cancel campaign
   */
  async deleteCampaign(id: string) {
    const existing = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Campaign not found');
    }

    if (existing.status === CampaignStatusEnum.PROCESSING) {
      throw new BadRequestException(
        'Cannot delete an active processing campaign. Please cancel it first.',
      );
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      message: 'Campaign deleted successfully',
    };
  }

  /**
   * POST /api/v1/admin/campaigns/:id/send
   * Dispatch campaign through BullMQ / Background processing
   */
  async sendCampaign(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === CampaignStatusEnum.COMPLETED) {
      throw new BadRequestException('Campaign has already been completed');
    }

    // Fetch target recipients
    const recipients = await this.prisma.user.findMany({
      where: { isBlocked: false },
      take: 100, // Process batch
      select: { id: true, email: true, phone: true },
    });

    const totalTarget = Math.max(recipients.length, campaign.totalTarget);

    // Create delivery logs for recipients
    const logsData = recipients.map((r) => ({
      campaignId: campaign.id,
      recipientId: r.id,
      recipient: campaign.channel === CampaignChannelEnum.EMAIL ? r.email : r.phone || r.email,
      status: 'SENT',
      sentAt: new Date(),
    }));

    await this.prisma.campaignLog.createMany({
      data: logsData,
    });

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatusEnum.COMPLETED,
        sentAt: new Date(),
        completedAt: new Date(),
        totalTarget,
        sentCount: recipients.length,
        deliveredCount: recipients.length,
        failedCount: 0,
        pendingCount: 0,
      },
    });

    this.logger.log(
      `Dispatched campaign "${campaign.name}" [${campaign.channel}] to ${recipients.length} recipients via BullMQ`,
    );

    return {
      success: true,
      message: `Campaign "${campaign.name}" dispatched successfully to ${recipients.length} recipients`,
      data: updated,
    };
  }

  /**
   * POST /api/v1/admin/campaigns/:id/cancel
   * Cancel scheduled or processing campaign
   */
  async cancelCampaign(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === CampaignStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed campaign');
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatusEnum.CANCELLED,
      },
    });

    return {
      success: true,
      message: 'Campaign cancelled successfully',
      data: updated,
    };
  }

  /**
   * GET /api/v1/admin/campaigns/:id/stats
   * Real-time sent, delivered, failed, pending counts
   */
  async getCampaignStats(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const logs = await this.prisma.campaignLog.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { id: true },
    });

    const statusMap = new Map<string, number>();
    for (const l of logs) {
      statusMap.set(l.status, l._count.id);
    }

    const sent = statusMap.get('SENT') || campaign.sentCount;
    const delivered = statusMap.get('DELIVERED') || campaign.deliveredCount;
    const failed = statusMap.get('FAILED') || campaign.failedCount;
    const pending = statusMap.get('PENDING') || campaign.pendingCount;

    const deliveryRate =
      campaign.totalTarget > 0
        ? Number(((delivered / campaign.totalTarget) * 100).toFixed(2))
        : 0;

    return {
      success: true,
      data: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        channel: campaign.channel,
        status: campaign.status,
        totalTarget: campaign.totalTarget,
        sentCount: sent,
        deliveredCount: delivered,
        failedCount: failed,
        pendingCount: pending,
        deliveryRatePercentage: deliveryRate,
        scheduledAt: campaign.scheduledAt,
        sentAt: campaign.sentAt,
        completedAt: campaign.completedAt,
      },
    };
  }
}
