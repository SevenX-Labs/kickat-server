import { Test, TestingModule } from '@nestjs/testing';
import { CompareController } from './compare.controller';
import { CompareService } from './compare.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('CompareController', () => {
  let controller: CompareController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompareController],
      providers: [CompareService],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompareController>(CompareController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
