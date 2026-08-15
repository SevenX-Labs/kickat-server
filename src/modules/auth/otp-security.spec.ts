import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService, OtpCacheService } from '../../common';
import { OtpType } from '@prisma/client';
import { HttpException, HttpStatus, UnauthorizedException, INestApplication } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard, minutes, hours } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

describe('OTP Security & Rate Limiting Integration Suite', () => {
  let app: INestApplication;
  let authService: AuthService;
  let otpCacheService: OtpCacheService;
  let prismaMock: any;
  let emailServiceMock: any;
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

    emailServiceMock = {
      sendOtpEmail: jest.fn().mockResolvedValue(true),
    };

    jwtMock = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        return null;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'otp-send-short',
            ttl: minutes(10),
            limit: 3,
          },
          {
            name: 'otp-send-long',
            ttl: hours(1),
            limit: 20,
          },
          {
            name: 'otp-verify',
            ttl: hours(1),
            limit: 20,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        OtpCacheService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    authService = moduleFixture.get<AuthService>(AuthService);
    otpCacheService = moduleFixture.get<OtpCacheService>(OtpCacheService);

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. OTP Send 60-Second Cooldown', () => {
    it('should allow first mobile OTP send and block a second request during cooldown with 429', async () => {
      const phone = '+919876543210';
      prismaMock.otpLog.count.mockResolvedValue(0);
      prismaMock.otpLog.create.mockResolvedValue({ id: 'otp-1' });

      // First request -> succeeds
      const res1 = await authService.sendOtp({ phone });
      expect(res1.success).toBe(true);
      expect(otpCacheService.isCooldownActive(phone, 'phone')).toBe(true);

      // Second request immediately -> rejected with 429 cooldown active
      await expect(authService.sendOtp({ phone })).rejects.toThrow(
        new HttpException(
          'Please wait 60 seconds before requesting another OTP',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // Clear cooldown manually to simulate 60s passing -> third request succeeds
      otpCacheService.clearCooldown(phone, 'phone');
      expect(otpCacheService.isCooldownActive(phone, 'phone')).toBe(false);

      const res3 = await authService.sendOtp({ phone });
      expect(res3.success).toBe(true);
    });

    it('should allow first email OTP send and block a second request during cooldown with 429', async () => {
      const email = 'user@example.com';
      prismaMock.otpLog.count.mockResolvedValue(0);
      prismaMock.otpLog.create.mockResolvedValue({ id: 'otp-email-1' });

      // First request -> succeeds
      const res1 = await authService.sendEmailOtp({ email });
      expect(res1.success).toBe(true);
      expect(otpCacheService.isCooldownActive(email, 'email')).toBe(true);

      // Second request immediately -> rejected with 429
      await expect(authService.sendEmailOtp({ email })).rejects.toThrow(
        new HttpException(
          'Please wait 60 seconds before requesting another OTP',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('2. Preserved Hourly Rate Limits (5 requests / hour / phone or email)', () => {
    it('should reject mobile OTP send when hourly request count reaches 5', async () => {
      const phone = '+919876543211';
      otpCacheService.clearCooldown(phone, 'phone');
      prismaMock.otpLog.count.mockResolvedValue(5);

      await expect(authService.sendOtp({ phone })).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 5 per hour per identifier',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should reject email OTP send when hourly request count reaches 5', async () => {
      const email = 'limit@example.com';
      otpCacheService.clearCooldown(email, 'email');
      prismaMock.otpLog.count.mockResolvedValue(5);

      await expect(authService.sendEmailOtp({ email })).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 5 OTP requests per hour per email',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('3. OTP Expiry (5-Minute Window)', () => {
    it('should create OTP with 5-minute expiry timestamp', async () => {
      const phone = '+919876543212';
      otpCacheService.clearCooldown(phone, 'phone');
      prismaMock.otpLog.count.mockResolvedValue(0);

      const before = Date.now();
      await authService.sendOtp({ phone });
      const after = Date.now();

      expect(prismaMock.otpLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: phone,
            type: OtpType.SMS,
            expiresAt: expect.any(Date),
          }),
        }),
      );

      const createdCall = prismaMock.otpLog.create.mock.calls[0][0];
      const expiryTime = createdCall.data.expiresAt.getTime();
      const fiveMinMs = 5 * 60 * 1000;

      expect(expiryTime).toBeGreaterThanOrEqual(before + fiveMinMs - 1000);
      expect(expiryTime).toBeLessThanOrEqual(after + fiveMinMs + 1000);
    });

    it('should reject verification when OTP has expired', async () => {
      const phone = '+919876543212';
      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
      prismaMock.otpLog.findFirst.mockResolvedValue({
        id: 'expired-otp-id',
        identifier: phone,
        otpHash: await bcrypt.hash('123456', 10),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        isUsed: false,
        attempts: 0,
      });

      const mockRes: any = { cookie: jest.fn() };
      await expect(authService.verifyOtp({ phone, otp: '123456' }, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('4. Maximum 5 Attempts Per Individual OTP', () => {
    it('should track failed attempts, invalidate OTP on 5th failure, and reject 6th attempt', async () => {
      const phone = '+919876543213';
      const otpId = 'otp-attempt-tracking-id';
      const realOtpHash = await bcrypt.hash('999999', 10);

      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let currentDbAttempts = 0;
      prismaMock.otpLog.findFirst.mockImplementation(async () => ({
        id: otpId,
        identifier: phone,
        otpHash: realOtpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isUsed: false,
        attempts: currentDbAttempts,
      }));

      prismaMock.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.attempts?.increment) currentDbAttempts += data.attempts.increment;
        if (data.isUsed) return { id: otpId, isUsed: true };
        return { id: otpId, attempts: currentDbAttempts };
      });

      const mockRes: any = { cookie: jest.fn() };

      // Attempts 1 to 4: Wrong OTP -> throws UnauthorizedException
      for (let i = 1; i <= 4; i++) {
        await expect(
          authService.verifyOtp({ phone, otp: '000000' }, mockRes),
        ).rejects.toThrow(UnauthorizedException);
        expect(otpCacheService.getOtpAttempts(otpId)).toBe(i);
      }

      // Attempt 5: 5th failed attempt -> reaches attempt limit -> throws 429
      await expect(
        authService.verifyOtp({ phone, otp: '000000' }, mockRes),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // Attempt 6: Any further attempt -> rejected immediately
      await expect(
        authService.verifyOtp({ phone, otp: '999999' }, mockRes),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('5. Single-Use OTP Enforcement', () => {
    it('should successfully verify a correct OTP, mark it as isUsed, and prevent reuse', async () => {
      const phone = '+919876543214';
      const otpId = 'single-use-otp-id';
      const realOtp = '654321';
      const realOtpHash = await bcrypt.hash(realOtp, 10);

      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let isUsed = false;
      prismaMock.otpLog.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.isUsed === false && isUsed) return null;
        return {
          id: otpId,
          identifier: phone,
          otpHash: realOtpHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          isUsed,
          attempts: 0,
        };
      });

      prismaMock.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.isUsed !== undefined) isUsed = data.isUsed;
        return { id: otpId, isUsed };
      });

      prismaMock.user.findFirst.mockResolvedValue({
        id: 'user-123',
        phone,
        email: 'user@test.com',
        isPhoneVerified: true,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'user-123',
        phone,
        email: 'user@test.com',
        isPhoneVerified: true,
      });

      const mockRes: any = { cookie: jest.fn() };

      // First verification with correct OTP -> succeeds
      const result = await authService.verifyOtp({ phone, otp: realOtp }, mockRes);
      expect(result.success).toBe(true);
      expect(isUsed).toBe(true);

      // Second verification with the exact same OTP -> rejected (single-use)
      await expect(
        authService.verifyOtp({ phone, otp: realOtp }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('6. IP-Based Rate Limiting via ThrottlerGuard', () => {
    it('should limit POST /auth/otp/send to 3 requests per 10 minutes per IP (4th blocked with 429)', async () => {
      prismaMock.otpLog.count.mockResolvedValue(0);
      prismaMock.otpLog.create.mockResolvedValue({ id: 'ip-test-otp' });

      const server = app.getHttpServer();

      // Requests 1, 2, 3 with different phones (to bypass phone cooldown)
      for (let i = 1; i <= 3; i++) {
        const res = await request(server)
          .post('/auth/otp/send')
          .send({ phone: `+91987654321${i}` });
        expect(res.status).toBe(200);
      }

      // Request 4 from same IP within 10 minutes -> blocked with 429
      const res4 = await request(server)
        .post('/auth/otp/send')
        .send({ phone: '+919876543219' });
      expect(res4.status).toBe(429);
    });

    it('should limit POST /auth/otp/verify to 20 attempts per hour per IP', async () => {
      prismaMock.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
      prismaMock.otpLog.findFirst.mockResolvedValue(null);

      const server = app.getHttpServer();

      // Send 20 verify requests
      for (let i = 1; i <= 20; i++) {
        const res = await request(server)
          .post('/auth/otp/verify')
          .send({ phone: `+91987654321${i % 10}`, otp: '123456' });
        // Expected 401 because OTP not found, but NOT 429 yet
        expect(res.status).not.toBe(429);
      }

      // 21st attempt from same IP -> blocked by ThrottlerGuard with 429
      const res21 = await request(server)
        .post('/auth/otp/verify')
        .send({ phone: '+919876543210', otp: '123456' });
      expect(res21.status).toBe(429);
    });
  });

  describe('7. Cache Service Isolation & Future Redis Migration', () => {
    it('should isolate keys between phone and email cooldowns and per-OTP attempts', () => {
      const id1 = '+919876543210';
      const id2 = 'user@example.com';
      const otpId = 'uuid-otp-123';

      otpCacheService.setCooldown(id1, 'phone', 60000);
      otpCacheService.setCooldown(id2, 'email', 60000);
      otpCacheService.incrementOtpAttempts(otpId);

      expect(otpCacheService.isCooldownActive(id1, 'phone')).toBe(true);
      expect(otpCacheService.isCooldownActive(id1, 'email')).toBe(false);
      expect(otpCacheService.isCooldownActive(id2, 'email')).toBe(true);
      expect(otpCacheService.isCooldownActive(id2, 'phone')).toBe(false);
      expect(otpCacheService.getOtpAttempts(otpId)).toBe(1);

      otpCacheService.clearCooldown(id1, 'phone');
      expect(otpCacheService.isCooldownActive(id1, 'phone')).toBe(false);
      expect(otpCacheService.isCooldownActive(id2, 'email')).toBe(true);

      otpCacheService.clearOtpAttempts(otpId);
      expect(otpCacheService.getOtpAttempts(otpId)).toBe(0);
    });
  });
});
