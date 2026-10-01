import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('ProfileController', () => {
  let controller: ProfileController;

  const mockProfileService = {
    getProfile: jest.fn(),
    createOrUpdateProfile: jest.fn(),
    addAddress: jest.fn(),
    addPet: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: mockProfileService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
