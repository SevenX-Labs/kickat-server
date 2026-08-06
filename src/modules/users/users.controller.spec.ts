import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { ProfileService } from '../profile/profile.service';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockProfileService = {
    getProfile: jest.fn(),
  };

  const mockUsersService = {
    addRecentlyViewed: jest.fn(),
    getRecentlyViewed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: ProfileService, useValue: mockProfileService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
