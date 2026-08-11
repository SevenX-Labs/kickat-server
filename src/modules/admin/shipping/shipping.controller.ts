import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { AdminAuth } from '../../../common';
import {
  AdminShipmentsQueryDto,
  AssignCourierDto,
  UpdateShipmentStatusDto,
} from './dto/admin-shipping.dto';

@AdminAuth()
@Controller(['admin/shipments', 'admin/shipping'])
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /**
   * GET /api/v1/admin/shipments (or /api/v1/admin/shipping)
   * List all shipments with filtering, search, and KPI counters
   */
  @Get()
  async getShipments(@Query() query: AdminShipmentsQueryDto) {
    return this.shippingService.getShipments(query);
  }

  /**
   * GET /api/v1/admin/shipments/:id/tracking
   * Live tracking timeline with checkpoints and courier tracking URL
   */
  @Get(':id/tracking')
  async getShipmentTracking(@Param('id') id: string) {
    return this.shippingService.getShipmentTracking(id);
  }

  /**
   * GET /api/v1/admin/shipments/:id
   * Get complete shipment details
   */
  @Get(':id')
  async getShipmentById(@Param('id') id: string) {
    return this.shippingService.getShipmentById(id);
  }

  /**
   * POST /api/v1/admin/shipments/:id/assign
   * Assign courier partner and generate AWB number
   */
  @Post(':id/assign')
  async assignCourier(
    @Param('id') id: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.shippingService.assignCourier(id, dto);
  }

  /**
   * PATCH /api/v1/admin/shipments/:id/status
   * Update shipment delivery status (SHIPPED, OUT_FOR_DELIVERY, DELIVERED, RTO)
   */
  @Patch(':id/status')
  async updateShipmentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.shippingService.updateShipmentStatus(id, dto);
  }
}
