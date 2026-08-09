import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../../common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn(),
}));

describe('Admin AuthService', () => {
  let service: AuthService;

  const mockAdmin = {
    id: 'admin-uuid-1',
    adminId: 'admin',
    name: 'Super Admin',
    email: 'kickat2021@gmail.com',
    password: '$2b$10$hashedpassword',
    role: 'SUPER_ADMIN',
    permissions: ['ALL'],
    isActive: true,
    isBlocked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    admin: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    adminSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    adminResetToken: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked-token'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return null;
    }),
  };

  const mockEmailService = {
    sendOtpEmail: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if admin is not found', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ adminId: 'admin', password: 'password123' }, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ adminId: 'admin', password: 'wrongpassword' }, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if account is inactive or blocked', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue({
        ...mockAdmin,
        isBlocked: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ adminId: 'admin', password: 'kickat@2026' }, {} as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return tokens on valid credentials', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.adminSession.create.mockResolvedValue({});

      const result = await service.login(
        { adminId: 'admin', password: 'kickat@2026' },
        { headers: {}, ip: '127.0.0.1' } as any,
      );

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('mocked-token');
      expect(result.refreshToken).toBe('mocked-token');
      expect(result.admin.adminId).toBe('admin');
    });
  });

  describe('forgotPassword', () => {
    it('should throw NotFoundException if adminId is not found', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ adminId: 'unknown' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 429 HttpException if rate limit is exceeded (>3 per hour)', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.adminResetToken.count.mockResolvedValue(3);

      await expect(
        service.forgotPassword({ adminId: 'admin' }),
      ).rejects.toThrow(HttpException);
    });

    it('should generate OTP and send email on valid request', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.adminResetToken.count.mockResolvedValue(0);
      mockPrismaService.adminResetToken.create.mockResolvedValue({});

      const result = await service.forgotPassword({ adminId: 'admin' });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendOtpEmail).toHaveBeenCalled();
    });
  });

  describe('verifyResetOtp', () => {
    it('should throw 429 HttpException if total verification attempts >= 5', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.adminResetToken.findMany.mockResolvedValue([
        { attempts: 5 },
      ]);

      await expect(
        service.verifyResetOtp({ adminId: 'admin', otp: '123456' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw UnauthorizedException if OTP is invalid', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.adminResetToken.findMany.mockResolvedValue([]);
      mockPrismaService.adminResetToken.findFirst.mockResolvedValue({
        id: 'token-1',
        otpHash: 'hashedotp',
        attempts: 0,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrismaService.adminResetToken.update.mockResolvedValue({});

      await expect(
        service.verifyResetOtp({ adminId: 'admin', otp: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return resetToken if OTP is valid', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrismaService.adminResetToken.findMany.mockResolvedValue([]);
      mockPrismaService.adminResetToken.findFirst.mockResolvedValue({
        id: 'token-1',
        otpHash: 'hashedotp',
        attempts: 0,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.adminResetToken.update.mockResolvedValue({});

      const result = await service.verifyResetOtp({
        adminId: 'admin',
        otp: '123456',
      });

      expect(result.success).toBe(true);
      expect(result.resetToken).toBeDefined();
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if passwords do not match', async () => {
      await expect(
        service.resetPassword({
          resetToken: '123e4567-e89b-42d3-a456-426614174000',
          newPassword: 'Password@123',
          confirmPassword: 'Password@999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw GoneException if token has already been used', async () => {
      mockPrismaService.adminResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        isUsed: true,
      });

      await expect(
        service.resetPassword({
          resetToken: '123e4567-e89b-42d3-a456-426614174000',
          newPassword: 'Password@123',
          confirmPassword: 'Password@123',
        }),
      ).rejects.toThrow(GoneException);
    });
  });

  describe('changePassword', () => {
    it('should throw BadRequestException if new password is same as current', async () => {
      await expect(
        service.changePassword(mockAdmin as any, {
          currentPassword: 'kickat@2026',
          newPassword: 'kickat@2026',
          confirmPassword: 'kickat@2026',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
