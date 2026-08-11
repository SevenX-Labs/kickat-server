import { Test, TestingModule } from '@nestjs/testing';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import {
  AdminCustomersQueryDto,
  CustomerOrdersQueryDto,
  UpdateCustomerStatusDto,
} from './dto/admin-customer.dto';

describe('Admin CustomersController', () => {
  let controller: CustomersController;
  let service: CustomersService;

  const mockCustomersService = {
    getCustomers: jest.fn(),
    getCustomerById: jest.fn(),
    getCustomerOrders: jest.fn(),
    getCustomerAddresses: jest.fn(),
    getCustomerPets: jest.fn(),
    updateCustomerStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: mockCustomersService,
        },
      ],
    }).compile();

    controller = module.get<CustomersController>(CustomersController);
    service = module.get<CustomersService>(CustomersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getCustomers should delegate to service', async () => {
    const expected = { success: true, data: { customers: [] } };
    mockCustomersService.getCustomers.mockResolvedValue(expected);

    const query: AdminCustomersQueryDto = { page: 1, limit: 10 };
    const result = await controller.getCustomers(query);

    expect(result).toBe(expected);
    expect(mockCustomersService.getCustomers).toHaveBeenCalledWith(query);
  });

  it('getCustomerById should delegate to service', async () => {
    const expected = { success: true, data: { id: 'user-1' } };
    mockCustomersService.getCustomerById.mockResolvedValue(expected);

    const result = await controller.getCustomerById('user-1');

    expect(result).toBe(expected);
    expect(mockCustomersService.getCustomerById).toHaveBeenCalledWith('user-1');
  });

  it('getCustomerOrders should delegate to service', async () => {
    const expected = { success: true, data: { orders: [] } };
    mockCustomersService.getCustomerOrders.mockResolvedValue(expected);

    const query: CustomerOrdersQueryDto = { page: 1, limit: 5 };
    const result = await controller.getCustomerOrders('user-1', query);

    expect(result).toBe(expected);
    expect(mockCustomersService.getCustomerOrders).toHaveBeenCalledWith('user-1', query);
  });

  it('getCustomerAddresses should delegate to service', async () => {
    const expected = { success: true, data: { addresses: [] } };
    mockCustomersService.getCustomerAddresses.mockResolvedValue(expected);

    const result = await controller.getCustomerAddresses('user-1');

    expect(result).toBe(expected);
    expect(mockCustomersService.getCustomerAddresses).toHaveBeenCalledWith('user-1');
  });

  it('getCustomerPets should delegate to service', async () => {
    const expected = { success: true, data: { pets: [] } };
    mockCustomersService.getCustomerPets.mockResolvedValue(expected);

    const result = await controller.getCustomerPets('user-1');

    expect(result).toBe(expected);
    expect(mockCustomersService.getCustomerPets).toHaveBeenCalledWith('user-1');
  });

  it('updateCustomerStatus should delegate to service', async () => {
    const expected = { success: true, message: 'Customer blocked' };
    mockCustomersService.updateCustomerStatus.mockResolvedValue(expected);

    const dto: UpdateCustomerStatusDto = { isBlocked: true, reason: 'Fraud' };
    const result = await controller.updateCustomerStatus('user-1', dto);

    expect(result).toBe(expected);
    expect(mockCustomersService.updateCustomerStatus).toHaveBeenCalledWith('user-1', dto);
  });
});
