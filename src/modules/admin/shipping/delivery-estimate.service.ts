import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShippingService } from './shipping.service';
import { EkartProvider } from './providers/ekart.provider';
import { ShippingProvider } from './providers/shipping-provider.interface';

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
    @Optional() private readonly shippingService?: ShippingService,
    @Optional() private readonly ekartProvider?: EkartProvider,
  ) {}

  /**
   * Resolves the active shipping provider based on ShippingService or environment configuration.
   * Backward-compatible with standalone testing modules injecting providers directly.
   */
  private getShippingProvider(): ShippingProvider | null {
    if (this.shippingService) {
      return this.shippingService.getShippingProvider();
    }
    if (this.ekartProvider) {
      return this.ekartProvider;
    }
    return null;
  }

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
    const { weight, chargeableWeight, length, breadth, height } = await this.resolvePackageSpecs(
      params.productId,
      params.variantId,
      params.weight,
    );

    const isCod = params.cod !== false;

    // 2. Resolve active shipping provider
    const provider = this.getShippingProvider();
    if (
      !provider ||
      provider.providerName === 'UNCONFIGURED' ||
      typeof provider.checkServiceability !== 'function'
    ) {
      return {
        available: false,
        pincode: rawPincode,
        message: "Couldn't check delivery right now. Please try again.",
      };
    }

    // 3. Resolve warehouse pickup pincode
    const pickupLocationName = (this.configService.get<string>('EKART_PICKUP_ALIAS', '') || '').trim();

    let pickupPostcode: string | null = null;
    if (pickupLocationName && typeof provider.getPickupLocationPincode === 'function') {
      try {
        pickupPostcode = await provider.getPickupLocationPincode(
          pickupLocationName,
        );
      } catch (err: any) {
        this.logger.warn(
          `Could not resolve pickup location pincode: ${err?.message || err}`,
        );
      }
    }

    if (!pickupPostcode || !/^\d{6}$/.test(pickupPostcode)) {
      pickupPostcode = (this.configService.get<string>('EKART_PICKUP_PINCODE', '') || '').trim() || '721643';
    }

    // Use chargeable weight for serviceability if available
    const effectiveWeight = chargeableWeight ?? weight;

    // 4. Check in-memory cache
    const cacheKey = `${provider.providerName}_${pickupPostcode}_${rawPincode}_${effectiveWeight.toFixed(2)}_${isCod ? 1 : 0}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 5. Query active provider serviceability
    try {
      const check = await provider.checkServiceability({
        pickupPostcode,
        deliveryPostcode: rawPincode,
        weight: effectiveWeight,
        cod: isCod,
        length,
        breadth,
        height,
      });

      if (!check || !check.isServiceable) {
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

      let estimatedDateStr = check.estimatedDeliveryDate;
      let deliveryDays = check.estimatedDeliveryDays;
      let formattedDateStr: string | undefined;

      if (estimatedDateStr) {
        const parsed = new Date(estimatedDateStr);
        if (!isNaN(parsed.getTime())) {
          const day = parsed.getDate();
          const month = parsed.toLocaleDateString('en-US', { month: 'short' });
          formattedDateStr = `${day} ${month}`;
        }
      }

      if (!estimatedDateStr && deliveryDays) {
        const d = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const dayNum = String(d.getDate()).padStart(2, '0');
        estimatedDateStr = `${year}-${monthNum}-${dayNum}`;

        const day = d.getDate();
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        formattedDateStr = `${day} ${month}`;
      }

      const result: DeliveryEstimateResult = {
        available: true,
        pincode: rawPincode,
        courierName: check.courierGroup || `Ekart ${(this.configService.get<string>('EKART_DEFAULT_SERVICE', 'SURFACE') || 'SURFACE').trim()}`,
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
        `Failed to check ${provider.providerName} serviceability for pincode ${rawPincode}: ${err?.message || err}`,
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
    chargeableWeight?: number;
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
            const l = variant.shippingLengthCm || undefined;
            const b = variant.shippingBreadthCm || undefined;
            const h = variant.shippingHeightCm || undefined;
            let chargeableWeight: number | undefined;

            if (l && b && h) {
              const volumetricWeight = (l * b * h) / 5000;
              chargeableWeight = Math.max(weight, volumetricWeight);
              chargeableWeight =
                Math.round(chargeableWeight * 1000) / 1000;
            }

            return {
              weight,
              chargeableWeight,
              length: l,
              breadth: b,
              height: h,
            };
          }

          return { weight: 0.5 };
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve variant specs for ${variantId}: ${err}`,
        );
      }
    }

    if (productId) {
      return this.resolveProductSpecs(productId);
    }

    return { weight: 0.5 };
  }

  private async resolveProductSpecs(productId: string): Promise<{
    weight: number;
    chargeableWeight?: number;
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
        const l = product.shippingLengthCm || undefined;
        const b = product.shippingBreadthCm || undefined;
        const h = product.shippingHeightCm || undefined;
        let chargeableWeight: number | undefined;

        if (l && b && h) {
          const volumetricWeight = (l * b * h) / 5000;
          chargeableWeight = Math.max(product.shippingWeightKg, volumetricWeight);
          chargeableWeight = Math.round(chargeableWeight * 1000) / 1000;
        }

        return {
          weight: product.shippingWeightKg,
          chargeableWeight,
          length: l,
          breadth: b,
          height: h,
        };
      }
    } catch (err) {
      this.logger.warn(
        `Could not resolve product specs for ${productId}: ${err}`,
      );
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
