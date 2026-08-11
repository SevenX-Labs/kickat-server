import { Test, TestingModule } from '@nestjs/testing';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import {
  AdminShipmentsQueryDto,
  AssignCourierDto,
  UpdateShipmentStatusDto,
} from './dto/admin-shipping.dto';
import { OrderStatusEnum } from '@prisma/client';

describe('Admin ShippingController', () => {
  let controller: ShippingController;
  let service: ShippingService;

  const mockShippingService = {
    getShipments: jest.fn(),
    getShipmentById: jest.fn(),
    assignCourier: jest.fn(),
    updateShipmentStatus: jest.fn(),
    getShipmentTracking: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShippingController],
      providers: [
        {
          provide: ShippingService,
          useValue: mockShippingService,
        },
      ],
    }).compile();

    controller = module.get<ShippingController>(ShippingController);
    service = module.get<ShippingService>(ShippingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getShipments should delegate to service', async () => {
    const expected = { success: true, data: { shipments: [] } };
    mockShippingService.getShipments.mockResolvedValue(expected);

    const query: AdminShipmentsQueryDto = { page: 1, limit: 10 };
    const result = await controller.getShipments(query);

    expect(result).toBe(expected);
    expect(mockShippingService.getShipments).toHaveBeenCalledWith(query);
  });

  it('getShipmentById should delegate to service', async () => {
    const expected = { success: true, data: { id: 'ord-1' } };
    mockShippingService.getShipmentById.mockResolvedValue(expected);

    const result = await controller.getShipmentById('ord-1');

    expect(result).toBe(expected);
    expect(mockShippingService.getShipmentById).toHaveBeenCalledWith('ord-1');
  });

  it('assignCourier should delegate to service', async () => {
    const expected = { success: true, message: 'Assigned' };
    mockShippingService.assignCourier.mockResolvedValue(expected);

    const dto: AssignCourierDto = { courierPartner: 'Delhivery' };
    const result = await controller.assignCourier('ord-1', dto);

    expect(result).toBe(expected);
    expect(mockShippingService.assignCourier).toHaveBeenCalledWith('ord-1', dto);
  });

  it('updateShipmentStatus should delegate to service', async () => {
    const expected = { success: true, message: 'Updated' };
    mockShippingService.updateShipmentStatus.mockResolvedValue(expected);

    const dto: UpdateShipmentStatusDto = { status: OrderStatusEnum.DELIVERED };
    const result = await controller.updateShipmentStatus('ord-1', dto);

    expect(result).toBe(expected);
    expect(mockShippingService.updateShipmentStatus).toHaveBeenCalledWith('ord-1', dto);
  });

  it('getShipmentTracking should delegate to service', async () => {
    const expected = { success: true, data: { timeline: [] } };
    mockShippingService.getShipmentTracking.mockResolvedValue(expected);

    const result = await controller.getShipmentTracking('ord-1');

    expect(result).toBe(expected);
    expect(mockShippingService.getShipmentTracking).toHaveBeenCalledWith('ord-1');
  });
});
