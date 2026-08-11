import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UpdateAllSettingsDto,
  UpdateDeliverySettingsDto,
  UpdateGeneralSettingsDto,
  UpdatePaymentSettingsDto,
  UpdateStoreSettingsDto,
  UpdateTaxSettingsDto,
} from './dto/admin-settings.dto';

const MASKED_SECRET = '••••••••';

const DEFAULT_GENERAL_SETTINGS = {
  siteName: 'Kickat Pet Care',
  siteDescription: 'Premium Pet Nutrition & Care Supplies',
  supportEmail: 'support@kickat.in',
  supportPhone: '+91-98765-43210',
  logoUrl: 'https://kickat.in/logo.png',
  faviconUrl: 'https://kickat.in/favicon.ico',
  maintenanceMode: false,
  smtp: {
    host: 'smtp.sendgrid.net',
    port: 587,
    user: 'apikey',
    password: '',
    isSecure: true,
    fromEmail: 'noreply@kickat.in',
  },
};

const DEFAULT_STORE_SETTINGS = {
  storeName: 'Kickat Store',
  legalBusinessName: 'Kickat Pet Care Private Limited',
  currency: 'INR',
  currencySymbol: '₹',
  country: 'India',
  timezone: 'Asia/Kolkata',
  orderPrefix: 'ORD-',
  invoicePrefix: 'INV-',
  minOrderValue: 0,
  maxOrderValue: 500000,
  autoCancelUnpaidMinutes: 30,
};

const DEFAULT_PAYMENT_SETTINGS = {
  razorpay: {
    enabled: true,
    keyId: 'rzp_test_samplekey123',
    keySecret: '',
    webhookSecret: '',
  },
  cod: {
    enabled: true,
    maxAmount: 5000,
    extraFee: 0,
  },
  upi: { enabled: true },
  wallet: { enabled: true },
  card: { enabled: true },
  netbanking: { enabled: true },
};

const DEFAULT_TAX_SETTINGS = {
  taxEnabled: true,
  gstNumber: '27AABCU9603R1ZM',
  standardGstRate: 18,
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 18,
  hsnCodes: {
    petFood: '2309',
    petAccessories: '4201',
    petMedicines: '3004',
  },
  pricesIncludeTax: true,
};

const DEFAULT_DELIVERY_SETTINGS = {
  standardDeliveryFee: 50,
  freeDeliveryThreshold: 499,
  estimatedDeliveryDays: 3,
  defaultCourier: 'Delhivery',
  supportedCouriers: ['Delhivery', 'Shiprocket', 'BlueDart', 'DTDC'],
  deliverySlots: [
    'Morning (9AM - 1PM)',
    'Afternoon (1PM - 5PM)',
    'Evening (5PM - 9PM)',
  ],
  enableRtoTracking: true,
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to retrieve raw setting group from database or fallback to defaults
   */
  private async getRawSettingGroup(group: string, defaults: any) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: group },
    });

    if (!setting) {
      return { ...defaults };
    }

    return { ...defaults, ...(setting.value as any) };
  }

  /**
   * Helper to save raw setting group to database
   */
  private async saveRawSettingGroup(group: string, value: any, isSecret = false) {
    const saved = await this.prisma.systemSetting.upsert({
      where: { key: group },
      update: {
        value,
        group,
        isSecret,
      },
      create: {
        key: group,
        group,
        value,
        isSecret,
      },
    });

    return saved.value;
  }

  /**
   * Masks secrets from General settings (SMTP password)
   */
  private sanitizeGeneralSettings(raw: any) {
    const result = { ...raw };
    if (result.smtp) {
      const hasPassword = Boolean(result.smtp.password && result.smtp.password !== MASKED_SECRET);
      result.smtp = {
        host: result.smtp.host,
        port: result.smtp.port,
        user: result.smtp.user,
        isSecure: result.smtp.isSecure,
        fromEmail: result.smtp.fromEmail,
        hasPassword,
        password: hasPassword ? MASKED_SECRET : '',
      };
    }
    return result;
  }

  /**
   * Masks secrets from Payment settings (Razorpay secret & webhook)
   */
  private sanitizePaymentSettings(raw: any) {
    const result = { ...raw };
    if (result.razorpay) {
      const hasSecretKey = Boolean(
        result.razorpay.keySecret && result.razorpay.keySecret !== MASKED_SECRET,
      );
      const hasWebhookSecret = Boolean(
        result.razorpay.webhookSecret && result.razorpay.webhookSecret !== MASKED_SECRET,
      );

      result.razorpay = {
        enabled: result.razorpay.enabled,
        keyId: result.razorpay.keyId,
        hasSecretKey,
        hasWebhookSecret,
        keySecret: hasSecretKey ? MASKED_SECRET : '',
        webhookSecret: hasWebhookSecret ? MASKED_SECRET : '',
      };
    }
    return result;
  }

  /**
   * GET /api/v1/admin/settings
   * Returns consolidated view of all settings with secrets masked
   */
  async getAllSettings() {
    const [general, store, payment, tax, delivery] = await Promise.all([
      this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS),
      this.getRawSettingGroup('store', DEFAULT_STORE_SETTINGS),
      this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS),
      this.getRawSettingGroup('tax', DEFAULT_TAX_SETTINGS),
      this.getRawSettingGroup('delivery', DEFAULT_DELIVERY_SETTINGS),
    ]);

    return {
      success: true,
      data: {
        general: this.sanitizeGeneralSettings(general),
        store,
        payment: this.sanitizePaymentSettings(payment),
        tax,
        delivery,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/settings
   * Bulk update across multiple settings groups
   */
  async updateAllSettings(dto: UpdateAllSettingsDto) {
    const updates: Promise<any>[] = [];

    if (dto.general) updates.push(this.updateGeneralSettings(dto.general));
    if (dto.store) updates.push(this.updateStoreSettings(dto.store));
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
      data: this.sanitizeGeneralSettings(raw),
    };
  }

  /**
   * PATCH /api/v1/admin/settings/general
   */
  async updateGeneralSettings(dto: UpdateGeneralSettingsDto) {
    const existing = await this.getRawSettingGroup('general', DEFAULT_GENERAL_SETTINGS);

    let updatedSmtp = existing.smtp;
    if (dto.smtp) {
      const newPassword =
        dto.smtp.password && dto.smtp.password !== MASKED_SECRET
          ? dto.smtp.password
          : existing.smtp?.password || '';

      updatedSmtp = {
        ...existing.smtp,
        ...dto.smtp,
        password: newPassword,
      };
    }

    const merged = {
      ...existing,
      ...dto,
      ...(dto.smtp && { smtp: updatedSmtp }),
    };

    await this.saveRawSettingGroup('general', merged, true);

    return {
      success: true,
      message: 'General settings updated successfully',
      data: this.sanitizeGeneralSettings(merged),
    };
  }

  /**
   * GET /api/v1/admin/settings/store
   */
  async getStoreSettings() {
    const raw = await this.getRawSettingGroup('store', DEFAULT_STORE_SETTINGS);
    return {
      success: true,
      data: raw,
    };
  }

  /**
   * PATCH /api/v1/admin/settings/store
   */
  async updateStoreSettings(dto: UpdateStoreSettingsDto) {
    const existing = await this.getRawSettingGroup('store', DEFAULT_STORE_SETTINGS);
    const merged = { ...existing, ...dto };

    await this.saveRawSettingGroup('store', merged, false);

    return {
      success: true,
      message: 'Store settings updated successfully',
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
      data: this.sanitizePaymentSettings(raw),
    };
  }

  /**
   * PATCH /api/v1/admin/settings/payment
   */
  async updatePaymentSettings(dto: UpdatePaymentSettingsDto) {
    const existing = await this.getRawSettingGroup('payment', DEFAULT_PAYMENT_SETTINGS);

    let updatedRazorpay = existing.razorpay;
    if (dto.razorpay) {
      const newKeySecret =
        dto.razorpay.keySecret && dto.razorpay.keySecret !== MASKED_SECRET
          ? dto.razorpay.keySecret
          : existing.razorpay?.keySecret || '';

      const newWebhookSecret =
        dto.razorpay.webhookSecret && dto.razorpay.webhookSecret !== MASKED_SECRET
          ? dto.razorpay.webhookSecret
          : existing.razorpay?.webhookSecret || '';

      updatedRazorpay = {
        ...existing.razorpay,
        ...dto.razorpay,
        keySecret: newKeySecret,
        webhookSecret: newWebhookSecret,
      };
    }

    const merged = {
      ...existing,
      ...dto,
      ...(dto.razorpay && { razorpay: updatedRazorpay }),
    };

    await this.saveRawSettingGroup('payment', merged, true);

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: this.sanitizePaymentSettings(merged),
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
      ...(dto.hsnCodes && { hsnCodes: { ...existing.hsnCodes, ...dto.hsnCodes } }),
    };

    await this.saveRawSettingGroup('tax', merged, false);

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
    const merged = { ...existing, ...dto };

    await this.saveRawSettingGroup('delivery', merged, false);

    return {
      success: true,
      message: 'Delivery settings updated successfully',
      data: merged,
    };
  }
}
