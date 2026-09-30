import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShiprocketProvider } from './providers/shiprocket.provider';

export interface DeliveryEstimateResult {
  available: boolean;
  pincode: string;
  courierName?: string;
  estimatedDeliveryDate?: string; // YYYY-MM-DD
  estimatedDeliveryDays?: number; // e.g. 7
  formattedDate?: string; // e.g. "7 Oct"
  message?: string;
}

interface CacheEntry {
  data: DeliveryEstimateResult;
  expiresAt: number;
}

@Injectable()
export class DeliveryEstimateService {
  private readonly logger = new Logger(DeliveryEstimateService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly shiprocketProvider: ShiprocketProvider,
  ) {}

  /**
   * Public customer delivery estimate based on pincode and product/variant
   */
  async getEstimate(params: {
    pincode: string;
    productId?: string;
    variantId?: string;
    weight?: number;
    cod?: boolean;
  }): Promise<DeliveryEstimateResult> {
    const rawPincode = (params.pincode || '').trim();
    if (!/^[1-9][0-9]{5}$/.test(rawPincode)) {
      return {
        available: false,
        pincode: rawPincode,
        message: 'Enter a valid 6-digit pincode.',
      };
    }

    // 1. Resolve weight and dimensions from variant or product
    const { weight, length, breadth, height } = await this.resolvePackageSpecs(
      params.productId,
      params.variantId,
      params.weight,
    );

    const isCod = params.cod !== false;

    // 2. Resolve warehouse pickup pincode
    const pickupLocationName = this.configService.get<string>(
      'SHIPROCKET_PICKUP_LOCATION',
      "Bhim's",
    );
    let pickupPostcode: string | null = null;
    if (typeof this.shiprocketProvider.getPickupLocationPincode === 'function') {
      try {
        pickupPostcode = await this.shiprocketProvider.getPickupLocationPincode(
          pickupLocationName,
        );
      } catch (err) {
        this.logger.warn(`Could not resolve pickup location pincode: ${err}`);
      }
    }
    if (!pickupPostcode || !/^\d{6}$/.test(pickupPostcode)) {
      pickupPostcode =
        (this.configService.get<string>('SHIPROCKET_PICKUP_PINCODE', '') || '').trim() ||
        '721643';
    }

    // 3. Check in-memory cache
    const cacheKey = `${pickupPostcode}_${rawPincode}_${weight.toFixed(2)}_${isCod ? 1 : 0}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 4. Query Shiprocket serviceability
    try {
      if (typeof this.shiprocketProvider.checkServiceability !== 'function') {
        return {
          available: false,
          pincode: rawPincode,
          message: "Couldn't check delivery right now. Please try again.",
        };
      }

      const response = await this.shiprocketProvider.checkServiceability<{
        status?: number;
        data?: {
          recommended_courier_company_id?: number | string;
          shiprocket_recommended_courier_id?: number | string;
          promise_recommended_courier_company_id?: number | string;
          available_courier_companies?: Array<{
            courier_company_id: number | string;
            courier_name: string;
            rate?: number;
            etd?: string;
            estimated_delivery_days?: number | string;
            etd_hours?: number;
            rating?: number;
          }>;
        };
      }>({
        pickupPostcode,
        deliveryPostcode: rawPincode,
        weight,
        cod: isCod,
        length,
        breadth,
        height,
      });

      const availableCouriers = response?.data?.available_courier_companies;
      if (!Array.isArray(availableCouriers) || availableCouriers.length === 0) {
        const result: DeliveryEstimateResult = {
          available: false,
          pincode: rawPincode,
          message: 'Delivery is currently unavailable for this pincode.',
        };
        this.cache.set(cacheKey, {
          data: result,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
        return result;
      }

      // Pick recommended courier consistent with fulfillment logic
      const recId =
        response?.data?.recommended_courier_company_id ??
        response?.data?.shiprocket_recommended_courier_id ??
        response?.data?.promise_recommended_courier_company_id;

      const selectedCourier =
        (recId != null
          ? availableCouriers.find(
              (c) => String(c.courier_company_id) === String(recId),
            )
          : null) || availableCouriers[0];

      // Extract delivery days & ETD
      let deliveryDays = selectedCourier.estimated_delivery_days
        ? Number(selectedCourier.estimated_delivery_days)
        : undefined;

      let estimatedDateStr: string | undefined;
      let formattedDateStr: string | undefined;

      if (selectedCourier.etd) {
        const parsed = new Date(selectedCourier.etd);
        if (!isNaN(parsed.getTime())) {
          const year = parsed.getFullYear();
          const monthNum = String(parsed.getMonth() + 1).padStart(2, '0');
          const dayNum = String(parsed.getDate()).padStart(2, '0');
          estimatedDateStr = `${year}-${monthNum}-${dayNum}`;

          const day = parsed.getDate();
          const month = parsed.toLocaleDateString('en-US', { month: 'short' });
          formattedDateStr = `${day} ${month}`;

          if (!deliveryDays || isNaN(deliveryDays)) {
            const diffMs = parsed.getTime() - Date.now();
            deliveryDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          }
        }
      }

      if (!estimatedDateStr && deliveryDays && !isNaN(deliveryDays)) {
        const d = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const dayNum = String(d.getDate()).padStart(2, '0');
        estimatedDateStr = `${year}-${monthNum}-${dayNum}`;

        const day = d.getDate();
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        formattedDateStr = `${day} ${month}`;
      }

      if (!estimatedDateStr) {
        const result: DeliveryEstimateResult = {
          available: false,
          pincode: rawPincode,
          message: 'Delivery is currently unavailable for this pincode.',
        };
        return result;
      }

      const result: DeliveryEstimateResult = {
        available: true,
        pincode: rawPincode,
        courierName: selectedCourier.courier_name,
        estimatedDeliveryDate: estimatedDateStr,
        estimatedDeliveryDays: deliveryDays,
        formattedDate: formattedDateStr,
      };

      this.cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return result;
    } catch (err: any) {
      this.logger.error(
        `Failed to check Shiprocket serviceability for pincode ${rawPincode}: ${err?.message || err}`,
      );
      return {
        available: false,
        pincode: rawPincode,
        message: "Couldn't check delivery right now. Please try again.",
      };
    }
  }

  private async resolvePackageSpecs(
    productId?: string,
    variantId?: string,
    explicitWeight?: number,
  ): Promise<{
    weight: number;
    length?: number;
    breadth?: number;
    height?: number;
  }> {
    if (explicitWeight && explicitWeight > 0) {
      return { weight: Number(explicitWeight) };
    }

    if (variantId) {
      try {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
          select: {
            id: true,
            shippingWeightKg: true,
            shippingLengthCm: true,
            shippingBreadthCm: true,
            shippingHeightCm: true,
            name: true,
            attributes: true,
            productId: true,
          },
        });

        if (variant) {
          let weight: number | null | undefined = variant.shippingWeightKg;
          if (!weight || weight <= 0) {
            weight = this.parseWeightFromString(variant.name);
            if (!weight && variant.attributes) {
              const attrStr = JSON.stringify(variant.attributes);
              weight = this.parseWeightFromString(attrStr);
            }
          }

          if (weight && weight > 0) {
            return {
              weight,
              length: variant.shippingLengthCm || undefined,
              breadth: variant.shippingBreadthCm || undefined,
              height: variant.shippingHeightCm || undefined,
            };
          }

          if (variant.productId) {
            return this.resolveProductSpecs(variant.productId);
          }
        }
      } catch (err) {
        this.logger.warn(`Could not resolve variant specs for ${variantId}: ${err}`);
      }
    }

    if (productId) {
      return this.resolveProductSpecs(productId);
    }

    return { weight: 0.5 };
  }

  private async resolveProductSpecs(productId: string): Promise<{
    weight: number;
    length?: number;
    breadth?: number;
    height?: number;
  }> {
    try {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          productId,
        );

      const product = await this.prisma.product.findFirst({
        where: isUuid
          ? { id: productId, deletedAt: null }
          : { slug: productId, deletedAt: null },
        select: {
          shippingWeightKg: true,
          shippingLengthCm: true,
          shippingBreadthCm: true,
          shippingHeightCm: true,
        },
      });

      if (product && product.shippingWeightKg && product.shippingWeightKg > 0) {
        return {
          weight: product.shippingWeightKg,
          length: product.shippingLengthCm || undefined,
          breadth: product.shippingBreadthCm || undefined,
          height: product.shippingHeightCm || undefined,
        };
      }
    } catch (err) {
      this.logger.warn(`Could not resolve product specs for ${productId}: ${err}`);
    }

    return { weight: 0.5 };
  }

  private parseWeightFromString(str?: string | null): number | undefined {
    if (!str) return undefined;
    const match = str.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|grams?)\b/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('g')) {
        return val / 1000;
      }
      return val;
    }
    return undefined;
  }
}
