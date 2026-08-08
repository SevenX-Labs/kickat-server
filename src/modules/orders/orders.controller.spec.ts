import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CancelReasonEnum } from './dto/cancel-order.dto';
import { ReturnReasonEnum } from './dto/return-order.dto';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockOrderId = '22222222-2222-4222-8222-222222222222';
  const mockOrderItemId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    service = {
      getOrders: jest.fn().mockResolvedValue({ success: true, orders: [] }),
      getOrderAgain: jest.fn().mockResolvedValue({ success: true, items: [] }),
      getOrderById: jest.fn().mockResolvedValue({ success: true, order: { id: mockOrderId } }),
      getOrderTimeline: jest.fn().mockResolvedValue({ success: true, timeline: [] }),
      getOrderTracking: jest.fn().mockResolvedValue({ success: true, trackingNumber: 'TRK-123' }),
      getOrderTrackingLive: jest.fn().mockResolvedValue({ success: true, liveLocation: {} }),
      getOrderInvoice: jest.fn().mockResolvedValue({ success: true, invoice: {} }),
      cancelOrder: jest.fn().mockResolvedValue({ success: true, status: 'CANCELLED' }),
      returnOrder: jest.fn().mockResolvedValue({ success: true, returnId: 'ret_1' }),
      reorder: jest.fn().mockResolvedValue({ success: true, reorderedItemsCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getOrders', async () => {
    const query = { page: 1, limit: 10 };
    const res = await controller.getOrders(mockUserId, query);
    expect(service.getOrders).toHaveBeenCalledWith(mockUserId, query);
    expect(res.success).toBe(true);
  });

  it('should call getOrderAgain', async () => {
    const query = { page: 1, limit: 10 };
    const res = await controller.getOrderAgain(mockUserId, query);
    expect(service.getOrderAgain).toHaveBeenCalledWith(mockUserId, query);
    expect(res.success).toBe(true);
  });

  it('should call getBuyAgain', async () => {
    const query = { page: 1, limit: 10 };
    const res = await controller.getBuyAgain(mockUserId, query);
    expect(service.getOrderAgain).toHaveBeenCalledWith(mockUserId, query);
    expect(res.success).toBe(true);
  });

  it('should call getOrderById', async () => {
    const res = await controller.getOrderById(mockUserId, mockOrderId);
    expect(service.getOrderById).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call getOrderTimeline', async () => {
    const res = await controller.getOrderTimeline(mockUserId, mockOrderId);
    expect(service.getOrderTimeline).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call getOrderTracking', async () => {
    const res = await controller.getOrderTracking(mockUserId, mockOrderId);
    expect(service.getOrderTracking).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call getOrderTrackingLive', async () => {
    const res = await controller.getOrderTrackingLive(mockUserId, mockOrderId);
    expect(service.getOrderTrackingLive).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call getOrderInvoice', async () => {
    const res = await controller.getOrderInvoice(mockUserId, mockOrderId);
    expect(service.getOrderInvoice).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call cancelOrder', async () => {
    const dto = { reason: CancelReasonEnum.CHANGED_MIND };
    const res = await controller.cancelOrder(mockUserId, mockOrderId, dto);
    expect(service.cancelOrder).toHaveBeenCalledWith(mockUserId, mockOrderId, dto);
    expect(res.success).toBe(true);
  });

  it('should call returnOrder', async () => {
    const dto = {
      items: [{ orderItemId: mockOrderItemId, reason: ReturnReasonEnum.DAMAGED }],
    };
    const res = await controller.returnOrder(mockUserId, mockOrderId, dto);
    expect(service.returnOrder).toHaveBeenCalledWith(mockUserId, mockOrderId, dto);
    expect(res.success).toBe(true);
  });

  it('should call reorder by id', async () => {
    const res = await controller.reorder(mockUserId, mockOrderId);
    expect(service.reorder).toHaveBeenCalledWith(mockUserId, mockOrderId);
    expect(res.success).toBe(true);
  });

  it('should call reorderPost with dto', async () => {
    const dto = { orderId: mockOrderId };
    const res = await controller.reorderPost(mockUserId, dto);
    expect(service.reorder).toHaveBeenCalledWith(mockUserId, dto);
    expect(res.success).toBe(true);
  });

  it('should call reorderOrderAgain with dto', async () => {
    const dto = { productId: '44444444-4444-4444-8444-444444444444', quantity: 2 };
    const res = await controller.reorderOrderAgain(mockUserId, dto);
    expect(service.reorder).toHaveBeenCalledWith(mockUserId, dto);
    expect(res.success).toBe(true);
  });

  it('should call orderAgain with dto', async () => {
    const dto = { items: [{ productId: '44444444-4444-4444-8444-444444444444', quantity: 1 }] };
    const res = await controller.orderAgain(mockUserId, dto);
    expect(service.reorder).toHaveBeenCalledWith(mockUserId, dto);
    expect(res.success).toBe(true);
  });
});
