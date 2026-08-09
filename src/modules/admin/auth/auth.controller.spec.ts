import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('Admin AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    forgotPassword: jest.fn(),
    verifyResetOtp: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
    getSessions: jest.fn(),
    deleteSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login should delegate to authService', async () => {
    mockAuthService.login.mockResolvedValue({ success: true });
    const dto = { adminId: 'admin', password: 'password123' };

    const result = await controller.login(dto as any, {} as any);

    expect(result).toEqual({ success: true });
    expect(mockAuthService.login).toHaveBeenCalledWith(dto, {});
  });

  it('forgotPassword should delegate to authService', async () => {
    mockAuthService.forgotPassword.mockResolvedValue({ success: true });
    const dto = { adminId: 'admin' };

    const result = await controller.forgotPassword(dto);

    expect(result).toEqual({ success: true });
    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('getMe should delegate to authService', async () => {
    mockAuthService.getMe.mockResolvedValue({ success: true });
    const admin = { id: 'admin-1' };

    const result = await controller.getMe(admin as any);

    expect(result).toEqual({ success: true });
    expect(mockAuthService.getMe).toHaveBeenCalledWith(admin);
  });
});
