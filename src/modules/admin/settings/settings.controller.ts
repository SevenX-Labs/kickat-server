import {
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminAuth } from '../../../common';
import {
  UpdateAllSettingsDto,
  UpdateDeliverySettingsDto,
  UpdateGeneralSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateTaxSettingsDto,
} from './dto/admin-settings.dto';

@AdminAuth()
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/v1/admin/settings
   * Returns consolidated view of the 4 setting groups
   */
  @Get()
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  /**
   * PATCH /api/v1/admin/settings
   * Bulk update across multiple settings groups
   */
  @Patch()
  async updateAllSettings(@Body() dto: UpdateAllSettingsDto) {
    return this.settingsService.updateAllSettings(dto);
  }

  /**
   * GET /api/v1/admin/settings/general
   */
  @Get('general')
  async getGeneralSettings() {
    return this.settingsService.getGeneralSettings();
  }

  /**
   * PATCH /api/v1/admin/settings/general
   */
  @Patch('general')
  async updateGeneralSettings(@Body() dto: UpdateGeneralSettingsDto) {
    return this.settingsService.updateGeneralSettings(dto);
  }

  /**
   * GET /api/v1/admin/settings/payment
   */
  @Get('payment')
  async getPaymentSettings() {
    return this.settingsService.getPaymentSettings();
  }

  /**
   * PATCH /api/v1/admin/settings/payment
   */
  @Patch('payment')
  async updatePaymentSettings(@Body() dto: UpdatePaymentSettingsDto) {
    return this.settingsService.updatePaymentSettings(dto);
  }

  /**
   * GET /api/v1/admin/settings/tax
   */
  @Get('tax')
  async getTaxSettings() {
    return this.settingsService.getTaxSettings();
  }

  /**
   * PATCH /api/v1/admin/settings/tax
   */
  @Patch('tax')
  async updateTaxSettings(@Body() dto: UpdateTaxSettingsDto) {
    return this.settingsService.updateTaxSettings(dto);
  }

  /**
   * GET /api/v1/admin/settings/delivery
   */
  @Get('delivery')
  async getDeliverySettings() {
    return this.settingsService.getDeliverySettings();
  }

  /**
   * PATCH /api/v1/admin/settings/delivery
   */
  @Patch('delivery')
  async updateDeliverySettings(@Body() dto: UpdateDeliverySettingsDto) {
    return this.settingsService.updateDeliverySettings(dto);
  }
}

@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/v1/settings/public
   * Returns socialLinks, supportEmail, supportPhone, maintenanceMode
   */
  @Get('public')
  async getPublicSettings() {
    return this.settingsService.getPublicGeneralSettings();
  }
}
