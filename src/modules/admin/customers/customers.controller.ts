import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AdminAuth } from '../../../common';
import {
  AdminCustomersQueryDto,
  CustomerOrdersQueryDto,
  UpdateCustomerStatusDto,
} from './dto/admin-customer.dto';

@AdminAuth()
@Controller('admin/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * GET /api/v1/admin/customers
   * Search, filter, sort, and paginate customers
   */
  @Get()
  async getCustomers(@Query() query: AdminCustomersQueryDto) {
    return this.customersService.getCustomers(query);
  }

  /**
   * GET /api/v1/admin/customers/:id/orders
   * Customer's order history
   */
  @Get(':id/orders')
  async getCustomerOrders(
    @Param('id') id: string,
    @Query() query: CustomerOrdersQueryDto,
  ) {
    return this.customersService.getCustomerOrders(id, query);
  }

  /**
   * GET /api/v1/admin/customers/:id/addresses
   * Customer's saved addresses
   */
  @Get(':id/addresses')
  async getCustomerAddresses(@Param('id') id: string) {
    return this.customersService.getCustomerAddresses(id);
  }

  /**
   * GET /api/v1/admin/customers/:id/pets
   * Customer's registered pets
   */
  @Get(':id/pets')
  async getCustomerPets(@Param('id') id: string) {
    return this.customersService.getCustomerPets(id);
  }

  /**
   * GET /api/v1/admin/customers/:id
   * Complete customer profile with lifetime spending stats
   */
  @Get(':id')
  async getCustomerById(@Param('id') id: string) {
    return this.customersService.getCustomerById(id);
  }

  /**
   * PATCH /api/v1/admin/customers/:id/status
   * Block or unblock customer (with token revocation on block)
   */
  @Patch(':id/status')
  async updateCustomerStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
  ) {
    return this.customersService.updateCustomerStatus(id, dto);
  }
}
