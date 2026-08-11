import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AdminAuth } from '../../../common';
import {
  AdminCampaignsQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/admin-campaign.dto';

@AdminAuth()
@Controller('admin/campaigns')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/v1/admin/campaigns
   * List all campaigns with status, channel, date, and audience
   */
  @Get()
  async getCampaigns(@Query() query: AdminCampaignsQueryDto) {
    return this.notificationsService.getCampaigns(query);
  }

  /**
   * GET /api/v1/admin/campaigns/:id
   * Get campaign details and message configuration
   */
  @Get(':id')
  async getCampaignById(@Param('id') id: string) {
    return this.notificationsService.getCampaignById(id);
  }

  /**
   * POST /api/v1/admin/campaigns
   * Create WhatsApp/SMS/Email campaign
   */
  @Post()
  async createCampaign(@Body() dto: CreateCampaignDto) {
    return this.notificationsService.createCampaign(dto);
  }

  /**
   * PATCH /api/v1/admin/campaigns/:id
   * Edit draft/scheduled campaign
   */
  @Patch(':id')
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.notificationsService.updateCampaign(id, dto);
  }

  /**
   * DELETE /api/v1/admin/campaigns/:id
   * Delete or cancel campaign
   */
  @Delete(':id')
  async deleteCampaign(@Param('id') id: string) {
    return this.notificationsService.deleteCampaign(id);
  }

  /**
   * POST /api/v1/admin/campaigns/:id/send
   * Start/send campaign through BullMQ
   */
  @Post(':id/send')
  async sendCampaign(@Param('id') id: string) {
    return this.notificationsService.sendCampaign(id);
  }

  /**
   * POST /api/v1/admin/campaigns/:id/cancel
   * Cancel scheduled/processing campaign
   */
  @Post(':id/cancel')
  async cancelCampaign(@Param('id') id: string) {
    return this.notificationsService.cancelCampaign(id);
  }

  /**
   * GET /api/v1/admin/campaigns/:id/stats
   * Sent, delivered, failed, pending counts
   */
  @Get(':id/stats')
  async getCampaignStats(@Param('id') id: string) {
    return this.notificationsService.getCampaignStats(id);
  }
}
