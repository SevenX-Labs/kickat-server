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
    adminId: 'kickat2021',
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
      findFirst: jest.fn(),
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
    verify: jest.fn().mockReturnValue({
      sub: 'admin-uuid-1',
      adminId: 'kickat2021',
      email: 'kickat2021@gmail.com',
      role: 'SUPER_ADMIN',
      type: 'admin',
    }),
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
        service.login(
          { adminId: 'admin', password: 'wrongpassword' },
          {} as any,
        ),
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
      expect(result.admin.adminId).toBe('kickat2021');
    });

    it('should support 30-day rememberMe session in login', async () => {
      mockPrismaService.admin.findUnique.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.adminSession.create.mockResolvedValue({});

      const result = await service.login(
        { adminId: 'admin', password: 'kickat@2026', rememberMe: true },
        { headers: {}, ip: '127.0.0.1' } as any,
      );

      expect(result.success).toBe(true);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true }),
        expect.objectContaining({ expiresIn: '30d' }),
      );
      expect(mockPrismaService.adminSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        }),
      );
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

  describe('refreshToken', () => {
    const validRefreshToken = 'valid.jwt.refreshtoken';
    const mockSession = {
      id: 'session-uuid-1',
      adminId: mockAdmin.id,
      refreshTokenHash: 'somehash',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      admin: mockAdmin,
    };

    it('should throw UnauthorizedException if refreshToken is missing or invalid string', async () => {
      await expect(
        service.refreshToken(undefined as any, {} as any),
      ).rejects.toThrow(UnauthorizedException);

      await expect(service.refreshToken('' as any, {} as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if jwtService.verify throws', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token payload type is not admin', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: 'user-1',
        type: 'user',
      });

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if session is not found in db', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        type: 'admin',
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if session is revoked', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        type: 'admin',
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce({
        ...mockSession,
        isRevoked: true,
      });

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if session is expired', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        type: 'admin',
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce({
        ...mockSession,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if admin is inactive or blocked', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        type: 'admin',
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce({
        ...mockSession,
        admin: { ...mockAdmin, isActive: false },
      });

      await expect(
        service.refreshToken(validRefreshToken, {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should successfully rotate tokens and update existing session', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        adminId: mockAdmin.adminId,
        email: mockAdmin.email,
        role: mockAdmin.role,
        type: 'admin',
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce(
        mockSession,
      );
      mockPrismaService.adminSession.update.mockResolvedValueOnce({});
      mockJwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const reqMock = {
        headers: { 'user-agent': 'Chrome', 'x-forwarded-for': '10.0.0.1' },
        ip: '10.0.0.1',
      } as any;

      const result = await service.refreshToken(validRefreshToken, reqMock);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.admin.adminId).toBe(mockAdmin.adminId);

      expect(mockPrismaService.adminSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSession.id },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
            expiresAt: expect.any(Date),
            ipAddress: '10.0.0.1',
            userAgent: 'Chrome',
          }),
        }),
      );
    });

    it('should preserve 30-day session if rememberMe was true', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: mockAdmin.id,
        adminId: mockAdmin.adminId,
        type: 'admin',
        rememberMe: true,
      });
      mockPrismaService.adminSession.findFirst.mockResolvedValueOnce(
        mockSession,
      );
      mockPrismaService.adminSession.update.mockResolvedValueOnce({});

      await service.refreshToken(validRefreshToken, { headers: {} } as any);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true }),
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });
  });

  describe('getSessions', () => {
    it('should include lastActiveAt populated from updatedAt', async () => {
      const now = new Date();
      mockPrismaService.adminSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-1',
          ipAddress: '127.0.0.1',
          userAgent: 'Firefox',
          createdAt: now,
          expiresAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.getSessions(mockAdmin);

      expect(result.success).toBe(true);
      expect(result.sessions[0].lastActiveAt).toEqual(now);
    });
  });
});
