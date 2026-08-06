import { Controller, Get, Param, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Auth, CurrentUser } from '../../common';
import { GetReturnsQueryDto } from './dto/get-returns-query.dto';

@Auth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /returns
   */
  @Get()
  async getReturns(
    @CurrentUser('id') userId: string,
    @Query() query: GetReturnsQueryDto,
  ) {
    return this.ordersService.getReturns(userId, query);
  }

  /**
   * GET /returns/:id
   */
  @Get(':id')
  async getReturnById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.getReturnById(userId, id);
  }
}
