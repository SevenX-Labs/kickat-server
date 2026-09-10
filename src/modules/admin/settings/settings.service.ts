import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UpdateAllSettingsDto,
  UpdateDeliverySettingsDto,
  UpdateGeneralSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateTaxSettingsDto,
} from './dto/admin-settings.dto';

export const DEFAULT_GENERAL_SETTINGS = {
  socialLinks: {
    instagram: '',
    facebook: '',
    youtube: '',
    twitter: '',
    linkedin: '',
  },
  supportEmail: 'support@kickat.co.in',
  supportPhone: '+91 98765 43210',
  maintenanceMode: false,
};

export const DEFAULT_PAYMENT_SETTINGS = {
  cod: {
    enabled: true,
    extraFee: 0,
  },
  upi: {
    enabled: true,
  },
  card: {
    enabled: true,
  },
};

export const DEFAULT_TAX_SETTINGS = {
  gstEnabled: false,
  gstNumber: null,
  gstPercentage: 0,
};

export const DEFAULT_DELIVERY_SETTINGS = {
  deliveryFeeEnabled: true,
  deliveryFee: 50,
  freeDeliveryThreshold: 499,
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to retrieve raw setting group from database
   */
  async getRawSettingGroup(group: string, defaults: any) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: group },
    });

    if (!setting || !setting.value) {
      return { ...defaults };
    }

    return { ...defaults, ...(setting.value as any) };
  }

  async getDeliverySettingsRaw() {
    return this.getRawSettingGroup('delivery', DEFAULT_DELIVERY_SETTINGS);
  }

  async getPaymentSettingsRaw() {
    return this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS);
  }

  async getTaxSettingsRaw() {
    return this.getRawSettingGroup('tax', DEFAULT_TAX_SETTINGS);
  }

  async getGeneralSettingsRaw() {
    return this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS);
  }

  /**
   * Helper to save raw setting group to database
   */
  private async saveRawSettingGroup(group: string, value: any) {
    const saved = await this.prisma.systemSetting.upsert({
      where: { key: group },
      update: {
        value,
        group,
        isSecret: false,
      },
      create: {
        key: group,
        group,
        value,
        isSecret: false,
      },
    });

    return saved.value;
  }

  /**
   * GET /api/v1/admin/settings
   * Returns consolidated view of the 4 settings groups
   */
  async getAllSettings() {
    const [general, payment, tax, delivery] = await Promise.all([
      this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS),
      this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS),
      this.getRawSettingGroup('tax', DEFAULT_TAX_SETTINGS),
      this.getRawSettingGroup('delivery', DEFAULT_DELIVERY_SETTINGS),
    ]);

    return {
      success: true,
      data: {
        general,
        payment,
        tax,
        delivery,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/settings
   * Bulk update across settings groups
   */
  async updateAllSettings(dto: UpdateAllSettingsDto) {
    const updates: Promise<any>[] = [];

    if (dto.general) updates.push(this.updateGeneralSettings(dto.general));
    if (dto.payment) updates.push(this.updatePaymentSettings(dto.payment));
    if (dto.tax) updates.push(this.updateTaxSettings(dto.tax));
    if (dto.delivery) updates.push(this.updateDeliverySettings(dto.delivery));

    await Promise.all(updates);

    return this.getAllSettings();
  }

  /**
   * GET /api/v1/admin/settings/general
   */
  async getGeneralSettings() {
    const raw = await this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS);
    return {
      success: true,
      data: raw,
    };
  }

  /**
   * PATCH /api/v1/admin/settings/general
   */
  async updateGeneralSettings(dto: UpdateGeneralSettingsDto) {
    const existing = await this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS);

    const merged = {
      ...existing,
      ...dto,
      ...(dto.socialLinks && {
        socialLinks: {
          ...existing.socialLinks,
          ...dto.socialLinks,
        },
      }),
    };

    await this.saveRawSettingGroup('general', merged);

    return {
      success: true,
      message: 'General settings updated successfully',
      data: merged,
    };
  }

  /**
   * GET /api/v1/admin/settings/payment
   */
  async getPaymentSettings() {
    const raw = await this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS);
    return {
      success: true,
      data: raw,
    };
  }

  /**
   * PATCH /api/v1/admin/settings/payment
   */
  async updatePaymentSettings(dto: UpdatePaymentSettingsDto) {
    const existing = await this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS);

    const merged = {
      ...existing,
      ...(dto.cod && {
        cod: {
          ...existing.cod,
          ...dto.cod,
        },
      }),
      ...(dto.upi && {
        upi: {
          ...existing.upi,
          ...dto.upi,
        },
      }),
      ...(dto.card && {
        card: {
          ...existing.card,
          ...dto.card,
        },
      }),
    };

    await this.saveRawSettingGroup('payment', merged);

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: merged,
    };
  }

  /**
   * GET /api/v1/admin/settings/tax
   */
  async getTaxSettings() {
    const raw = await this.getRawSettingGroup('tax', DEFAULT_TAX_SETTINGS);
    return {
      success: true,
      data: raw,
    };
  }

  /**
   * PATCH /api/v1/admin/settings/tax
   */
  async updateTaxSettings(dto: UpdateTaxSettingsDto) {
    const existing = await this.getRawSettingGroup('tax', DEFAULT_TAX_SETTINGS);
    const merged = {
      ...existing,
      ...dto,
    };

    await this.saveRawSettingGroup('tax', merged);

    return {
      success: true,
      message: 'Tax settings updated successfully',
      data: merged,
    };
  }

  /**
   * GET /api/v1/admin/settings/delivery
   */
  async getDeliverySettings() {
    const raw = await this.getRawSettingGroup('delivery', DEFAULT_DELIVERY_SETTINGS);
    return {
      success: true,
      data: raw,
    };
  }

  /**
   * PATCH /api/v1/admin/settings/delivery
   */
  async updateDeliverySettings(dto: UpdateDeliverySettingsDto) {
    const existing = await this.getRawSettingGroup('delivery', DEFAULT_DELIVERY_SETTINGS);
    const merged = {
      ...existing,
      ...dto,
    };

    await this.saveRawSettingGroup('delivery', merged);

    return {
      success: true,
      message: 'Delivery settings updated successfully',
      data: merged,
    };
  }

  /**
   * GET /api/v1/settings/public
   * Public general settings for customer frontend (social links, contact info, maintenance mode)
   */
  async getPublicGeneralSettings() {
    const general = await this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS);
    return {
      success: true,
      data: {
        socialLinks: general.socialLinks || DEFAULT_GENERAL_SETTINGS.socialLinks,
        supportEmail: general.supportEmail || DEFAULT_GENERAL_SETTINGS.supportEmail,
        supportPhone: general.supportPhone || DEFAULT_GENERAL_SETTINGS.supportPhone,
        maintenanceMode: Boolean(general.maintenanceMode),
      },
    };
  }
}
