import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpChannelType } from './dto/send-otp.dto';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

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

    let tokenCounter = 0;
    jwtMock = {
      sign: jest.fn().mockImplementation(() => `mock-jwt-token-${++tokenCounter}`),
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

  describe('googleAuth rate limiting', () => {
    it('should allow up to 10 requests per hour per IP and throw 429 on the 11th request', async () => {
      const mockReq: any = { ip: '192.168.1.100' };
      const mockRes: any = { cookie: jest.fn() };
      const dto = { code: 'bad_code', redirectUri: 'http://localhost/callback' };

      // Mock OAuth2Client prototype to fail instantly without network calls
      jest.spyOn(OAuth2Client.prototype, 'getToken').mockRejectedValue(new Error('Invalid code'));

      // Make 10 requests (fail at OAuth level, pass rate limit)
      for (let i = 0; i < 10; i++) {
        try {
          await service.googleAuth(dto, mockReq, mockRes);
        } catch (err) {
          expect(err.status).not.toBe(429);
        }
      }

      // The 11th request from the same IP must throw 429 Too Many Requests
      await expect(service.googleAuth(dto, mockReq, mockRes)).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 10 Google auth requests per hour per IP',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('refreshToken reuse detection (stateful token rotation & family revocation test)', () => {
    it('should rotate Token A to Token B, then upon replaying Token A return 401 AND explicitly revoke Token B in the database', async () => {
      const mockRes: any = { cookie: jest.fn(), clearCookie: jest.fn() };
      const familyId = 'family-uuid-12345';
      const userId = 'user-uuid-12345';

      const tokenAString = 'token-A-jwt-string';
      const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
      const hashA = hashToken(tokenAString);

      // Stateful in-memory token store simulating Prisma DB
      const dbTokensStore: Array<{
        id: string;
        tokenHash: string;
        userId: string;
        familyId: string;
        isRevoked: boolean;
        expiresAt: Date;
      }> = [
        {
          id: 'token-A-id',
          tokenHash: hashA,
          userId,
          familyId,
          isRevoked: false,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ];

      // Wire Prisma mock to real stateful store
      prismaMock.refreshToken.findUnique.mockImplementation(async ({ where }: any) => {
        return dbTokensStore.find((t) => t.tokenHash === where.tokenHash) || null;
      });

      prismaMock.refreshToken.update.mockImplementation(async ({ where, data }: any) => {
        const found = dbTokensStore.find((t) => t.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      });

      prismaMock.refreshToken.updateMany.mockImplementation(async ({ where, data }: any) => {
        let updatedCount = 0;
        for (const t of dbTokensStore) {
          if (t.familyId === where.familyId) {
            Object.assign(t, data);
            updatedCount++;
          }
        }
        return { count: updatedCount };
      });

      prismaMock.refreshToken.create.mockImplementation(async ({ data }: any) => {
        const newRecord = { id: `token-${dbTokensStore.length + 1}-id`, ...data };
        dbTokensStore.push(newRecord);
        return newRecord;
      });

      prismaMock.user.findUnique.mockResolvedValue({ id: userId, email: 'test@example.com' });
      jwtMock.verify.mockReturnValue({ sub: userId, familyId });

      // STEP 1: First invocation of refreshToken with Token A -> Token rotation happens
      const refreshResult1 = await service.refreshToken(tokenAString, mockRes);
      expect(refreshResult1.success).toBe(true);

      // Verify Token A is now revoked and Token B was created in DB store
      const tokenARecord = dbTokensStore.find((t) => t.tokenHash === hashA);
      const tokenBRecord = dbTokensStore.find((t) => t.id !== 'token-A-id');

      expect(tokenARecord?.isRevoked).toBe(true);
      expect(tokenBRecord).toBeDefined();
      expect(tokenBRecord?.isRevoked).toBe(false);

      // STEP 2: Replay Token A (token reuse attempt!)
      await expect(service.refreshToken(tokenAString, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );

      // STEP 3: EXPLICIT ASSERTION: Token B (the second-generation token) MUST ALSO BE REVOKED!
      expect(tokenBRecord?.isRevoked).toBe(true);
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('cleanupExpiredOtpLogs', () => {
    it('should purge expired or used OTP log entries', async () => {
      prismaMock.otpLog.deleteMany.mockResolvedValue({ count: 4 });
      const result = await service.cleanupExpiredOtpLogs();
      expect(prismaMock.otpLog.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ expiresAt: { lt: expect.any(Date) } }, { isUsed: true }],
        },
      });
      expect(result.count).toBe(4);
    });
  });
});
