import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpChannelType } from './dto/send-otp.dto';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtMock: any;
  let configMock: any;

  beforeEach(async () => {
    prismaMock = {
      otpLog: {
        count: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    jwtMock = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        if (key === 'GOOGLE_CLIENT_ID') return 'mock-google-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'mock-google-client-secret';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendOtp', () => {
    it('should successfully generate and log Mobile OTP when rate limit is not exceeded', async () => {
      prismaMock.otpLog.count.mockResolvedValue(2);
      prismaMock.otpLog.create.mockResolvedValue({ id: '1' });

      const result = await service.sendOtp({
        phone: '+919876543210',
        type: OtpChannelType.SMS,
      });

      expect(result.success).toBe(true);
      expect(prismaMock.otpLog.create).toHaveBeenCalled();
    });

    it('should throw 429 when rate limit of 5 requests per hour is reached', async () => {
      prismaMock.otpLog.count.mockResolvedValue(5);

      await expect(
        service.sendOtp({
          phone: '+919876543210',
          type: OtpChannelType.SMS,
        }),
      ).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 5 per hour per identifier',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('verifyOtp', () => {
    it('should throw 429 when total attempts exceed 5 per hour', async () => {
      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 5 } });

      const mockRes: any = { cookie: jest.fn() };
      await expect(
        service.verifyOtp(
          {
            identifier: '+919876543210',
            otp: '123456',
            type: OtpChannelType.SMS,
          },
          mockRes,
        ),
      ).rejects.toThrow(
        new HttpException('Too many attempts — max 5 per hour', HttpStatus.TOO_MANY_REQUESTS),
      );
    });

    it('should throw 401 if OTP is expired or not found', async () => {
      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
      prismaMock.otpLog.findFirst.mockResolvedValue(null);

      const mockRes: any = { cookie: jest.fn() };
      await expect(
        service.verifyOtp(
          {
            identifier: '+919876543210',
            otp: '654321',
            type: OtpChannelType.SMS,
          },
          mockRes,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken reuse detection', () => {
    it('should detect reuse of replayed token A, return 401, clear cookie, and revoke entire familyId (invalidating token B)', async () => {
      const mockRes: any = { cookie: jest.fn(), clearCookie: jest.fn() };
      const familyId = 'family-12345';
      const userId = 'user-12345';
      const tokenA = 'token-A-jwt';

      // 1. Mock JWT payload verification for token A
      jwtMock.verify.mockReturnValue({ sub: userId, familyId });

      // 2. Mock database lookup: Token A is already marked isRevoked: true (rotated)
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'token-A-id',
        tokenHash: 'hashed-token-A',
        userId,
        familyId,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 100000),
      });

      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      // 3. Replay Token A -> expectation: throws 401 Unauthorized
      await expect(service.refreshToken(tokenA, mockRes)).rejects.toThrow(UnauthorizedException);

      // 4. Verify that entire token family (familyId) was revoked in DB
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId },
        data: { isRevoked: true },
      });

      // 5. Verify cookie was cleared
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('cleanupExpiredOtpLogs', () => {
    it('should purge expired or used OTP log entries', async () => {
      prismaMock.otpLog.deleteMany.mockResolvedValue({ count: 4 });
      const result = await service.cleanupExpiredOtpLogs();
      expect(prismaMock.otpLog.deleteMany).toHaveBeenCalled();
      expect(result.count).toBe(4);
    });
  });
});
