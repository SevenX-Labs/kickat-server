import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import {
  AdminCancelOrderDto,
  AdminOrdersQueryDto,
  AdminRefundOrderDto,
  UpdateOrderStatusDto,
} from './dto/admin-order.dto';
import { OrderStatusEnum } from '@prisma/client';

describe('Admin OrdersController', () => {
  let controller: OrdersController;
  let service: OrdersService;

  const mockOrdersService = {
    getOrders: jest.fn(),
    getOrderById: jest.fn(),
    updateOrderStatus: jest.fn(),
    cancelOrder: jest.fn(),
    processRefund: jest.fn(),
    getOrderInvoice: jest.fn(),
    getPackingSlip: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOrders should delegate to service', async () => {
    const expected = { success: true, data: { orders: [] } };
    mockOrdersService.getOrders.mockResolvedValue(expected);

    const query: AdminOrdersQueryDto = { page: 1, limit: 10 };
    const result = await controller.getOrders(query);

    expect(result).toBe(expected);
    expect(mockOrdersService.getOrders).toHaveBeenCalledWith(query);
  });

  it('getOrderById should delegate to service', async () => {
    const expected = { success: true, data: { id: 'ord-1' } };
    mockOrdersService.getOrderById.mockResolvedValue(expected);

    const result = await controller.getOrderById('ord-1');

    expect(result).toBe(expected);
    expect(mockOrdersService.getOrderById).toHaveBeenCalledWith('ord-1');
  });

  it('updateOrderStatus should delegate to service', async () => {
    const expected = { success: true, data: { orderStatus: OrderStatusEnum.SHIPPED } };
    mockOrdersService.updateOrderStatus.mockResolvedValue(expected);

    const dto: UpdateOrderStatusDto = {
      status: OrderStatusEnum.SHIPPED,
      trackingNumber: 'TRK-123',
    };
    const result = await controller.updateOrderStatus('ord-1', dto);

    expect(result).toBe(expected);
    expect(mockOrdersService.updateOrderStatus).toHaveBeenCalledWith('ord-1', dto);
  });

  it('cancelOrder should delegate to service', async () => {
    const expected = { success: true, message: 'Cancelled' };
    mockOrdersService.cancelOrder.mockResolvedValue(expected);

    const dto: AdminCancelOrderDto = { reason: 'Customer requested' };
    const result = await controller.cancelOrder('ord-1', dto);

    expect(result).toBe(expected);
    expect(mockOrdersService.cancelOrder).toHaveBeenCalledWith('ord-1', dto);
  });

  it('processRefund should delegate to service', async () => {
    const expected = { success: true, message: 'Refunded' };
    mockOrdersService.processRefund.mockResolvedValue(expected);

    const dto: AdminRefundOrderDto = { reason: 'Returned item' };
    const result = await controller.processRefund('ord-1', dto);

    expect(result).toBe(expected);
    expect(mockOrdersService.processRefund).toHaveBeenCalledWith('ord-1', dto);
  });

  it('getOrderInvoice should delegate to service', async () => {
    const expected = { success: true, data: { invoiceNumber: 'INV-1' } };
    mockOrdersService.getOrderInvoice.mockResolvedValue(expected);

    const result = await controller.getOrderInvoice('ord-1');

    expect(result).toBe(expected);
    expect(mockOrdersService.getOrderInvoice).toHaveBeenCalledWith('ord-1');
  });

  it('getPackingSlip should delegate to service', async () => {
    const expected = { success: true, data: { slipNumber: 'PACK-1' } };
    mockOrdersService.getPackingSlip.mockResolvedValue(expected);

    const result = await controller.getPackingSlip('ord-1');

    expect(result).toBe(expected);
    expect(mockOrdersService.getPackingSlip).toHaveBeenCalledWith('ord-1');
  });
});
