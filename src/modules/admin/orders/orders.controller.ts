import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AdminAuth } from '../../../common';
import {
  AdminCancelOrderDto,
  AdminOrdersQueryDto,
  AdminRefundOrderDto,
  UpdateOrderStatusDto,
} from './dto/admin-order.dto';

@AdminAuth()
@Controller('admin/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /api/v1/admin/orders
   * List all orders with filters, search, sorting, and pagination
   */
  @Get()
  async getOrders(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.getOrders(query);
  }

  /**
   * GET /api/v1/admin/orders/:id/invoice
   * Generate tax invoice with GST breakdown
   */
  @Get(':id/invoice')
  async getOrderInvoice(@Param('id') id: string) {
    return this.ordersService.getOrderInvoice(id);
  }

  /**
   * GET /api/v1/admin/orders/:id/packing-slip
   * Generate warehouse fulfillment packing slip
   */
  @Get(':id/packing-slip')
  async getPackingSlip(@Param('id') id: string) {
    return this.ordersService.getPackingSlip(id);
  }

  /**
   * GET /api/v1/admin/orders/:id
   * Get complete details of an order
   */
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.getOrderById(id);
  }

  /**
   * PATCH /api/v1/admin/orders/:id/status
   * Update order status and courier tracking info
   */
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, dto);
  }

  /**
   * POST /api/v1/admin/orders/:id/cancel
   * Cancel order and restock inventory
   */
  @Post(':id/cancel')
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: AdminCancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(id, dto);
  }

  /**
   * POST /api/v1/admin/orders/:id/refund
   * Process refund for an order
   */
  @Post(':id/refund')
  async processRefund(
    @Param('id') id: string,
    @Body() dto: AdminRefundOrderDto,
  ) {
    return this.ordersService.processRefund(id, dto);
  }
}
