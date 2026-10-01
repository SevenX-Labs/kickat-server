import { Controller, Get, Query } from '@nestjs/common';
import { DeliveryEstimateService } from './delivery-estimate.service';
import { DeliveryEstimateQueryDto } from './dto/delivery-estimate.dto';

@Controller('shipping')
export class DeliveryEstimateController {
  constructor(
    private readonly deliveryEstimateService: DeliveryEstimateService,
  ) {}

  /**
   * GET /api/v1/shipping/delivery-estimate
   * Public customer delivery estimate based on pincode and product/variant
   * No rate limit to allow seamless customer browsing and pincode checks
   */
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
