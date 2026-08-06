import { Test, TestingModule } from '@nestjs/testing';
import { ReturnsController } from './returns.controller';
import { OrdersService } from './orders.service';

describe('ReturnsController', () => {
  let controller: ReturnsController;
  let service: any;

  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockReturnId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    service = {
      getReturns: jest.fn().mockResolvedValue({ success: true, returns: [] }),
      getReturnById: jest.fn().mockResolvedValue({ success: true, return: { id: mockReturnId } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReturnsController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();

    controller = module.get<ReturnsController>(ReturnsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getReturns', async () => {
    const query = { page: 1, limit: 10 };
    const res = await controller.getReturns(mockUserId, query);
    expect(service.getReturns).toHaveBeenCalledWith(mockUserId, query);
    expect(res.success).toBe(true);
  });

  it('should call getReturnById', async () => {
    const res = await controller.getReturnById(mockUserId, mockReturnId);
    expect(service.getReturnById).toHaveBeenCalledWith(mockUserId, mockReturnId);
    expect(res.success).toBe(true);
  });
});
