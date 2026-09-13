import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

export interface StockChangeTarget {
  productId: string;
  variantId?: string | null;
  previousStock: number;
  newStock: number;
  productName?: string;
  variantName?: string | null;
}

@Injectable()
export class StockAlertService {
  private readonly logger = new Logger(StockAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Evaluates a stock change event and triggers admin SMS + WhatsApp alerts if threshold crossed.
   */
  async evaluateStockChange(target: StockChangeTarget): Promise<void> {
    try {
      const { productId, variantId, previousStock, newStock } = target;

      // 1. If stock is restored (increased), no alert is sent, but alert eligibility is automatically re-armed
      if (newStock > previousStock) {
        return;
      }

      // 2. Fetch product & variant data if names/thresholds are not fully provided
      let productName = target.productName;
      let variantName = target.variantName;
      let threshold = 10; // Default fallback threshold

      if (variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
          include: { product: true },
        });
        if (variant) {
          productName = productName || variant.product.name;
          variantName = variantName !== undefined ? variantName : variant.name;
          const vAttr = variant.attributes as any;
          const pAttr = variant.product.attributes as any;
          threshold = Number(vAttr?.lowStockThreshold ?? pAttr?.lowStockThreshold ?? 10);
        }
      } else if (productId) {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });
        if (product) {
          productName = productName || product.name;
          const pAttr = product.attributes as any;
          threshold = Number(pAttr?.lowStockThreshold ?? 10);
        }
      }

      productName = productName || "Unknown Product";

      // 3. Check Event Type
      let eventType: "ADMIN_LOW_STOCK" | "ADMIN_OUT_OF_STOCK" | null = null;

      // LOW STOCK EVENT: Stock crossed from > threshold to <= threshold (and > 0)
      if (previousStock > threshold && newStock <= threshold && newStock > 0) {
        eventType = "ADMIN_LOW_STOCK";
      }
      // OUT OF STOCK EVENT: Stock crossed from > 0 to 0
      else if (previousStock > 0 && newStock === 0) {
        eventType = "ADMIN_OUT_OF_STOCK";
      }

      if (!eventType) {
        return; // No threshold-crossing event detected
      }

      // 4. Retrieve Admin Alert Phone Number
      let adminPhone: string | null = process.env.ADMIN_ALERT_PHONE || null;

      if (!adminPhone) {
        try {
          const setting = await this.prisma.systemSetting.findFirst({
            where: { key: "general_settings" },
          });
          if (setting && setting.value) {
            const val = setting.value as any;
            adminPhone = val.adminAlertPhone || val.supportPhone || null;
          }
        } catch (e) {
          // Ignore setting lookup error
        }
      }

      if (!adminPhone) {
        this.logger.warn(
          `[StockAlertService] Missing ADMIN_ALERT_PHONE configuration. Skipping SMS/WhatsApp alert for ${productName}.`
        );
        return;
      }

      // 5. Idempotency Check using NotificationLog
      // Key uniquely identifies target (product/variant) and exact event type for current stock cycle
      const targetEntityId = variantId ? `variant_${variantId}` : `product_${productId}`;
      const baseIdempotencyKey = `stock_alert_${targetEntityId}_${eventType}_${newStock}`;

      // 6. Format Alert Message
      const variantStr = variantName ? `\nVariant: ${variantName}` : "";
      let message = "";

      if (eventType === "ADMIN_LOW_STOCK") {
        message = `⚠️ Low Stock Alert\n\nProduct: ${productName}${variantStr}\nStock Remaining: ${newStock}\nLow Stock Threshold: ${threshold}\n\nPlease restock soon.`;
      } else {
        message = `🚨 Out of Stock Alert\n\nProduct: ${productName}${variantStr}\nStock Remaining: 0\n\nImmediate restocking may be required.`;
      }

      // 7. Dispatch SMS (Admin Only)
      const smsKey = `${baseIdempotencyKey}_SMS`;
      const smsAlreadySent = await this.isDispatched(smsKey);
      if (!smsAlreadySent) {
        try {
          await this.smsService.sendSms({
            recipient: adminPhone,
            message,
            templateCode: eventType,
            providerMessageId: smsKey,
          });
        } catch (smsErr: any) {
          this.logger.error(`Failed to send admin SMS alert for ${smsKey}:`, smsErr);
        }
      }

      // 8. Dispatch WhatsApp (Admin Only)
      const waKey = `${baseIdempotencyKey}_WHATSAPP`;
      const waAlreadySent = await this.isDispatched(waKey);
      if (!waAlreadySent) {
        try {
          await this.whatsappService.sendWhatsapp({
            recipient: adminPhone,
            message,
            templateCode: eventType,
            providerMessageId: waKey,
          });
        } catch (waErr: any) {
          this.logger.error(`Failed to send admin WhatsApp alert for ${waKey}:`, waErr);
        }
      }
    } catch (err: any) {
      // Reliability guarantee: Stock/Order operations MUST NEVER fail because of notification errors
      this.logger.error("Unhandled exception in evaluateStockChange:", err);
    }
  }

  private async isDispatched(providerMessageId: string): Promise<boolean> {
    try {
      const existing = await this.prisma.notificationLog.findFirst({
        where: { providerMessageId },
      });
      return !!existing;
    } catch (err) {
      return false;
    }
  }
}
