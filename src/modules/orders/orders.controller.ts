import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Auth, CurrentUser } from '../../common';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ReturnOrderDto } from './dto/return-order.dto';
import { ReorderDto } from './dto/reorder.dto';
import { OrderAgainQueryDto } from './dto/order-again-query.dto';

@Auth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /orders
   */
  @Get()
  async getOrders(
    @CurrentUser('id') userId: string,
    @Query() query: GetOrdersQueryDto,
  ) {
    return this.ordersService.getOrders(userId, query);
  }

  /**
   * GET /orders/order-again (Must be declared before :id)
   */
  @Get('order-again')
  async getOrderAgain(
    @CurrentUser('id') userId: string,
    @Query() query: OrderAgainQueryDto,
  ) {
    return this.ordersService.getOrderAgain(userId, query);
  }

  /**
   * GET /orders/buy-again (Alias for order-again)
   */
  @Get('buy-again')
  async getBuyAgain(
    @CurrentUser('id') userId: string,
    @Query() query: OrderAgainQueryDto,
  ) {
    return this.ordersService.getOrderAgain(userId, query);
  }

  /**
   * GET /orders/:id
   */
  @Get(':id')
  async getOrderById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderById(userId, id);
  }

  /**
   * GET /orders/:id/timeline
   */
  @Get(':id/timeline')
  async getOrderTimeline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderTimeline(userId, id);
  }

  /**
   * GET /orders/:id/tracking
   */
  @Get(':id/tracking')
  async getOrderTracking(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderTracking(userId, id);
  }

  /**
   * GET /orders/:id/tracking-live
   */
  @Get(':id/tracking-live')
  async getOrderTrackingLive(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderTrackingLive(userId, id);
  }

  /**
   * GET /orders/:id/invoice
   */
  @Get(':id/invoice')
  async getOrderInvoice(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderInvoice(userId, id);
  }

  /**
   * PATCH /orders/:id/cancel
   */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(userId, id, dto);
  }

  /**
   * POST /orders/:id/return
   */
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  async returnOrder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReturnOrderDto,
  ) {
    return this.ordersService.returnOrder(userId, id, dto);
  }

  /**
   * POST /orders/reorder
   */
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorderPost(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ordersService.reorder(userId, dto);
  }

  /**
   * POST /orders/order-again/reorder
   */
  @Post('order-again/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderOrderAgain(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ordersService.reorder(userId, dto);
  }

  /**
   * POST /orders/order-again
   */
  @Post('order-again')
  @HttpCode(HttpStatus.OK)
  async orderAgain(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ordersService.reorder(userId, dto);
  }

  /**
   * POST /orders/:id/reorder
   */
  @Post(':id/reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.reorder(userId, id);
  }
}
