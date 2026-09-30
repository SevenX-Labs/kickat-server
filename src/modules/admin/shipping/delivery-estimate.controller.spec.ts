import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryEstimateController } from './delivery-estimate.controller';
import { DeliveryEstimateService } from './delivery-estimate.service';

describe('DeliveryEstimateController', () => {
  let controller: DeliveryEstimateController;
  let service: jest.Mocked<Partial<DeliveryEstimateService>>;

  beforeEach(async () => {
    service = {
      getEstimate: jest.fn().mockResolvedValue({
        available: true,
        pincode: '400612',
        courierName: 'Delhivery Surface 2 Kgs',
        estimatedDeliveryDate: '2026-10-07',
        estimatedDeliveryDays: 7,
        formattedDate: '7 Oct',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryEstimateController],
      providers: [
        {
          provide: DeliveryEstimateService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DeliveryEstimateController>(DeliveryEstimateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward query parameters to service', async () => {
    const res = await controller.getDeliveryEstimate({
      pincode: '400612',
      productId: 'prod-uuid',
      variantId: 'var-uuid',
      weight: '1.2',
      cod: 'true',
    });

    expect(service.getEstimate).toHaveBeenCalledWith({
      pincode: '400612',
      productId: 'prod-uuid',
      variantId: 'var-uuid',
      weight: 1.2,
      cod: true,
    });

    expect(res).toEqual({
      available: true,
      pincode: '400612',
      courierName: 'Delhivery Surface 2 Kgs',
      estimatedDeliveryDate: '2026-10-07',
      estimatedDeliveryDays: 7,
      formattedDate: '7 Oct',
    });
  });
});
