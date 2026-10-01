import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { DeliveryEstimateService } from './delivery-estimate.service';
import { DeliveryEstimateQueryDto } from './dto/delivery-estimate.dto';

@Controller('shipping')
@UseGuards(ThrottlerGuard)
export class DeliveryEstimateController {
  constructor(
    private readonly deliveryEstimateService: DeliveryEstimateService,
  ) {}

  /**
   * GET /api/v1/shipping/delivery-estimate
   * Public customer delivery estimate based on pincode and product/variant
   * Target: 60 req/min for authenticated customers, 30 req/min for guests
   */
  @Throttle({
    'delivery-estimate': { limit: 60, ttl: 60000 },
  })
  @Get('delivery-estimate')
  async getDeliveryEstimate(@Query() query: DeliveryEstimateQueryDto) {
    return this.deliveryEstimateService.getEstimate({
      pincode: query.pincode,
      productId: query.productId,
      variantId: query.variantId,
      weight: query.weight ? Number(query.weight) : undefined,
      cod: query.cod === 'false' || query.cod === false ? false : true,
    });
  }
}
