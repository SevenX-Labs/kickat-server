import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileService } from '../profile/profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService, OtpCacheService } from '../../common';
import { OtpType } from '@prisma/client';
import { HttpException, HttpStatus, UnauthorizedException, INestApplication } from '@nestjs/common';
import { ThrottlerModule, minutes, hours } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

describe('User Verification OTP Security & Rate Limiting Suite', () => {
  let app: INestApplication;
  let usersService: UsersService;
  let otpCacheService: OtpCacheService;
  let mockPrismaService: any;
  let mockEmailService: any;
  let mockProfileService: any;

  beforeEach(async () => {
    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      otpLog: {
        count: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    mockEmailService = {
      sendOtpEmail: jest.fn().mockResolvedValue(true),
    };

    mockProfileService = {
      getProfile: jest.fn(),
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
      controllers: [UsersController],
      providers: [
        UsersService,
        OtpCacheService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ProfileService, useValue: mockProfileService },
      ],
    }).compile();

    usersService = moduleFixture.get<UsersService>(UsersService);
    otpCacheService = moduleFixture.get<OtpCacheService>(OtpCacheService);

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. User Email Verification Send', () => {
    it('should succeed on first send and reject second send within 60s cooldown with HTTP 429', async () => {
      const userId = 'user-1';
      const email = 'user@example.com';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.count.mockResolvedValue(0);
      mockPrismaService.otpLog.create.mockResolvedValue({ id: 'otp-user-email-1' });

      // First request -> success
      const res1 = await usersService.sendEmailVerification(userId, { email });
      expect(res1.success).toBe(true);
      expect(otpCacheService.isCooldownActive(email, 'user-email')).toBe(true);

      // Second request immediately -> 429
      await expect(usersService.sendEmailVerification(userId, { email })).rejects.toThrow(
        new HttpException(
          'Please wait 60 seconds before requesting another OTP',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // After cooldown expires -> request succeeds
      otpCacheService.clearCooldown(email, 'user-email');
      expect(otpCacheService.isCooldownActive(email, 'user-email')).toBe(false);
      const res3 = await usersService.sendEmailVerification(userId, { email });
      expect(res3.success).toBe(true);
    });

    it('should enforce 5 requests / hour / email limit', async () => {
      const userId = 'user-1';
      const email = 'user-limit@example.com';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.count.mockResolvedValue(5);

      await expect(usersService.sendEmailVerification(userId, { email })).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 5 OTP requests per hour per email',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('2. User Email Verification Verify', () => {
    it('should succeed with correct OTP and mark isUsed = true (single-use)', async () => {
      const userId = 'user-1';
      const email = 'user@example.com';
      const realOtp = '123456';
      const realOtpHash = await bcrypt.hash(realOtp, 10);
      const otpId = 'user-email-otp-id';

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let isUsed = false;
      mockPrismaService.otpLog.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.isUsed === false && isUsed) return null;
        return {
          id: otpId,
          identifier: email,
          otpHash: realOtpHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          isUsed,
          attempts: 0,
        };
      });

      mockPrismaService.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.isUsed !== undefined) isUsed = data.isUsed;
        return { id: otpId, isUsed };
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: userId,
        email,
        isEmailVerified: true,
      });

      // 1. Verify correct OTP
      const res = await usersService.verifyEmail(userId, { email, otp: realOtp });
      expect(res.success).toBe(true);
      expect(isUsed).toBe(true);

      // 2. Replay same OTP -> fails because single-use
      await expect(
        usersService.verifyEmail(userId, { email, otp: realOtp }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired email OTP (5-minute expiry)', async () => {
      const userId = 'user-1';
      const email = 'user@example.com';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
      mockPrismaService.otpLog.findFirst.mockResolvedValue({
        id: 'expired-email-otp',
        identifier: email,
        otpHash: await bcrypt.hash('123456', 10),
        expiresAt: new Date(Date.now() - 1000), // expired
        isUsed: false,
        attempts: 0,
      });

      await expect(
        usersService.verifyEmail(userId, { email, otp: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should enforce 5 attempts per individual OTP, invalidate OTP on 5th failure, and reject 6th attempt', async () => {
      const userId = 'user-1';
      const email = 'user-attempts@example.com';
      const otpId = 'email-otp-attempt-id';
      const realOtpHash = await bcrypt.hash('999999', 10);

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let attempts = 0;
      mockPrismaService.otpLog.findFirst.mockImplementation(async () => ({
        id: otpId,
        identifier: email,
        otpHash: realOtpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isUsed: false,
        attempts,
      }));

      mockPrismaService.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.attempts?.increment) attempts += data.attempts.increment;
        if (data.isUsed) return { id: otpId, isUsed: true };
        return { id: otpId, attempts };
      });

      // Attempts 1 to 4 -> Wrong OTP throws UnauthorizedException
      for (let i = 1; i <= 4; i++) {
        await expect(
          usersService.verifyEmail(userId, { email, otp: '000000' }),
        ).rejects.toThrow(UnauthorizedException);
        expect(otpCacheService.getOtpAttempts(otpId)).toBe(i);
      }

      // Attempt 5 -> reaches 5 attempts, invalidates OTP and throws 429
      await expect(
        usersService.verifyEmail(userId, { email, otp: '000000' }),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // Attempt 6 -> rejected immediately with 429
      await expect(
        usersService.verifyEmail(userId, { email, otp: '999999' }),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should enforce 5 verification attempts / hour / email', async () => {
      const userId = 'user-1';
      const email = 'user-hourly@example.com';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, email });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 5 } });

      await expect(
        usersService.verifyEmail(userId, { email, otp: '123456' }),
      ).rejects.toThrow(
        new HttpException('Too many attempts — max 5 per hour', HttpStatus.TOO_MANY_REQUESTS),
      );
    });
  });

  describe('3. User Mobile Verification Send', () => {
    it('should succeed on first send and reject second send within 60s cooldown with HTTP 429', async () => {
      const userId = 'user-2';
      const phone = '+919876543210';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, phone });
      mockPrismaService.otpLog.count.mockResolvedValue(0);
      mockPrismaService.otpLog.create.mockResolvedValue({ id: 'otp-user-mobile-1' });

      // First request -> success
      const res1 = await usersService.sendMobileVerification(userId, { phone });
      expect(res1.success).toBe(true);
      expect(otpCacheService.isCooldownActive(phone, 'user-phone')).toBe(true);

      // Second request immediately -> 429
      await expect(usersService.sendMobileVerification(userId, { phone })).rejects.toThrow(
        new HttpException(
          'Please wait 60 seconds before requesting another OTP',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // After cooldown expires -> request succeeds
      otpCacheService.clearCooldown(phone, 'user-phone');
      expect(otpCacheService.isCooldownActive(phone, 'user-phone')).toBe(false);
      const res3 = await usersService.sendMobileVerification(userId, { phone });
      expect(res3.success).toBe(true);
    });

    it('should enforce 5 requests / hour / phone limit', async () => {
      const userId = 'user-2';
      const phone = '+919876543211';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, phone });
      mockPrismaService.otpLog.count.mockResolvedValue(5);

      await expect(usersService.sendMobileVerification(userId, { phone })).rejects.toThrow(
        new HttpException(
          'Rate limit exceeded — max 5 per hour per identifier',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('4. User Mobile Verification Verify', () => {
    it('should succeed with correct OTP and mark isUsed = true (single-use)', async () => {
      const userId = 'user-2';
      const phone = '+919876543210';
      const realOtp = '654321';
      const realOtpHash = await bcrypt.hash(realOtp, 10);
      const otpId = 'user-mobile-otp-id';

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, phone });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let isUsed = false;
      mockPrismaService.otpLog.findFirst.mockImplementation(async ({ where }: any) => {
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

      mockPrismaService.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.isUsed !== undefined) isUsed = data.isUsed;
        return { id: otpId, isUsed };
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: userId,
        phone,
        isPhoneVerified: true,
      });

      // 1. Verify correct OTP
      const res = await usersService.verifyMobile(userId, { phone, otp: realOtp });
      expect(res.success).toBe(true);
      expect(isUsed).toBe(true);

      // 2. Replay same OTP -> fails
      await expect(
        usersService.verifyMobile(userId, { phone, otp: realOtp }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should enforce 5 attempts per individual mobile OTP, invalidate OTP on 5th failure, and reject 6th attempt', async () => {
      const userId = 'user-2';
      const phone = '+919876543219';
      const otpId = 'mobile-otp-attempt-id';
      const realOtpHash = await bcrypt.hash('111111', 10);

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, phone });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });

      let attempts = 0;
      mockPrismaService.otpLog.findFirst.mockImplementation(async () => ({
        id: otpId,
        identifier: phone,
        otpHash: realOtpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isUsed: false,
        attempts,
      }));

      mockPrismaService.otpLog.update.mockImplementation(async ({ data }: any) => {
        if (data.attempts?.increment) attempts += data.attempts.increment;
        if (data.isUsed) return { id: otpId, isUsed: true };
        return { id: otpId, attempts };
      });

      // Attempts 1 to 4
      for (let i = 1; i <= 4; i++) {
        await expect(
          usersService.verifyMobile(userId, { phone, otp: '000000' }),
        ).rejects.toThrow(UnauthorizedException);
        expect(otpCacheService.getOtpAttempts(otpId)).toBe(i);
      }

      // Attempt 5 -> reaches 5 attempts, invalidates OTP and throws 429
      await expect(
        usersService.verifyMobile(userId, { phone, otp: '000000' }),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // Attempt 6 -> rejected immediately
      await expect(
        usersService.verifyMobile(userId, { phone, otp: '111111' }),
      ).rejects.toThrow(
        new HttpException(
          'Maximum verification attempts exceeded for this OTP. Please request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should enforce 5 verification attempts / hour / phone', async () => {
      const userId = 'user-2';
      const phone = '+919876543210';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, phone });
      mockPrismaService.otpLog.aggregate.mockResolvedValue({ _sum: { attempts: 5 } });

      await expect(
        usersService.verifyMobile(userId, { phone, otp: '123456' }),
      ).rejects.toThrow(
        new HttpException('Too many attempts — max 5 per hour', HttpStatus.TOO_MANY_REQUESTS),
      );
    });
  });

  describe('5. Namespace Cache Isolation (Auth vs Users Verification)', () => {
    it('should ensure auth cooldown and user verification cooldown do not conflict for the same identifier', () => {
      const phone = '+919999999999';
      const email = 'shared@example.com';

      // Set cooldown for Auth OTP
      otpCacheService.setCooldown(phone, 'phone', 60000);
      otpCacheService.setCooldown(email, 'email', 60000);

      // Auth cooldown is active
      expect(otpCacheService.isCooldownActive(phone, 'phone')).toBe(true);
      expect(otpCacheService.isCooldownActive(email, 'email')).toBe(true);

      // User verification cooldown is NOT active
      expect(otpCacheService.isCooldownActive(phone, 'user-phone')).toBe(false);
      expect(otpCacheService.isCooldownActive(email, 'user-email')).toBe(false);

      // Now set User verification cooldown
      otpCacheService.setCooldown(phone, 'user-phone', 60000);
      otpCacheService.setCooldown(email, 'user-email', 60000);

      expect(otpCacheService.isCooldownActive(phone, 'user-phone')).toBe(true);
      expect(otpCacheService.isCooldownActive(email, 'user-email')).toBe(true);

      // Clear Auth cooldown -> User cooldown remains intact
      otpCacheService.clearCooldown(phone, 'phone');
      otpCacheService.clearCooldown(email, 'email');

      expect(otpCacheService.isCooldownActive(phone, 'phone')).toBe(false);
      expect(otpCacheService.isCooldownActive(email, 'email')).toBe(false);
      expect(otpCacheService.isCooldownActive(phone, 'user-phone')).toBe(true);
      expect(otpCacheService.isCooldownActive(email, 'user-email')).toBe(true);
    });
  });
});
