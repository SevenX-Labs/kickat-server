import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LogoutAllDto } from './dto/logout-all.dto';
import { OtpType, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OAuth2Client } from 'google-auth-library';
import { Response } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper to hash tokens
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * POST /auth/otp/send (Mobile SMS OTP)
   */
  async sendOtp(dto: SendOtpDto) {
    const phone = dto.phone;

    if (!phone) {
      throw new BadRequestException('phone is required');
    }

    // Rate limit: max 5 OTP requests per hour per phone
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await this.prisma.otpLog.count({
      where: {
        identifier: phone,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtpCount >= 5) {
      throw new HttpException(
        'Rate limit exceeded — max 5 per hour per identifier',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    await this.prisma.otpLog.create({
      data: {
        identifier: phone,
        otpHash,
        type: OtpType.SMS,
        expiresAt,
      },
    });

    // Mock SMS Sending / Console Log for Development
    this.logger.log(`[MOBILE OTP SENT] To: ${phone} | OTP: ${otp}`);

    return {
      success: true,
      message: `OTP sent successfully to ${phone}`,
    };
  }

  /**
   * POST /auth/otp/verify (Mobile SMS OTP Verification)
   */
  async verifyOtp(dto: VerifyOtpDto, res: Response) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Rate limit verification attempts per hour per phone
    const attemptsCount = await this.prisma.otpLog.aggregate({
      where: {
        identifier: dto.identifier,
        createdAt: { gte: oneHourAgo },
      },
      _sum: { attempts: true },
    });

    const totalAttempts = attemptsCount._sum.attempts || 0;
    if (totalAttempts >= 5) {
      throw new HttpException(
        'Too many attempts — max 5 per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latestOtp = await this.prisma.otpLog.findFirst({
      where: {
        identifier: dto.identifier,
        type: OtpType.SMS,
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
      throw new UnauthorizedException('Wrong or expired OTP');
    }

    const isMatch = await bcrypt.compare(dto.otp, latestOtp.otpHash);

    if (!isMatch) {
      await this.prisma.otpLog.update({
        where: { id: latestOtp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Wrong or expired OTP');
    }

    // Mark OTP as used
    await this.prisma.otpLog.update({
      where: { id: latestOtp.id },
      data: { isUsed: true },
    });

    // Upsert User by phone
    const user = await this.prisma.user.upsert({
      where: { phone: dto.identifier },
      update: { isPhoneVerified: true },
      create: { phone: dto.identifier, isPhoneVerified: true },
    });

    return this.generateTokensAndRespond(user, res);
  }

  /**
   * POST /auth/google (Gmail Login)
   */
  async googleAuth(dto: GoogleAuthDto, res: Response) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google OAuth client environment variables not configured');
    }

    try {
      const client = new OAuth2Client(clientId, clientSecret, dto.redirectUri);
      const { tokens } = await client.getToken(dto.code);

      if (!tokens.id_token) {
        throw new UnauthorizedException('Google verification failed, invalid code or id_token');
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.email_verified) {
        throw new UnauthorizedException('Google verification failed, email not verified');
      }

      let user = await this.prisma.user.findFirst({
        where: {
          OR: [{ googleId: payload.sub }, { email: payload.email }],
        },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: payload.sub,
            isEmailVerified: true,
            name: user.name || payload.name,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            googleId: payload.sub,
            name: payload.name,
            isEmailVerified: true,
          },
        });
      }

      return this.generateTokensAndRespond(user, res);
    } catch (error) {
      this.logger.error(`Google Auth Error: ${error?.message || error}`);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Google verification failed, email not verified');
    }
  }

  /**
   * POST /auth/refresh
   */
  async refreshToken(refreshTokenString: string | undefined, res: Response) {
    if (!refreshTokenString) {
      throw new UnauthorizedException('Missing, invalid, or reused refresh token');
    }

    try {
      const payload = this.jwtService.verify(refreshTokenString, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret',
      });

      const tokenHash = this.hashToken(refreshTokenString);
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Missing, invalid, or reused refresh token');
      }

      if (tokenRecord.isRevoked) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: tokenRecord.familyId },
          data: { isRevoked: true },
        });
        res.clearCookie('refreshToken');
        throw new UnauthorizedException('Missing, invalid, or reused refresh token');
      }

      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { isRevoked: true },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokensAndRespond(user, res, tokenRecord.familyId);
    } catch (error) {
      res.clearCookie('refreshToken');
      throw new UnauthorizedException('Missing, invalid, or reused refresh token');
    }
  }

  /**
   * POST /auth/logout
   */
  async logout(user: User, refreshTokenString: string | undefined, res: Response) {
    if (refreshTokenString) {
      const tokenHash = this.hashToken(refreshTokenString);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      });
    }

    res.clearCookie('refreshToken');
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * POST /auth/logout-all
   */
  async logoutAll(user: User, dto: LogoutAllDto, res: Response) {
    if (user.password) {
      if (!dto?.password) {
        throw new BadRequestException('Password required for logout-all');
      }
      const isPasswordValid = await bcrypt.compare(dto.password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Wrong password');
      }
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    res.clearCookie('refreshToken');

    return {
      success: true,
      message: 'Logged out from all devices successfully',
    };
  }

  private async generateTokensAndRespond(
    user: User,
    res: Response,
    familyIdInput?: string,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
    };

    const accessTokenSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') || 'default-access-secret';
    const refreshTokenSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret';

    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessTokenSecret,
      expiresIn: accessTokenExpiresIn as any,
    });

    const familyId = familyIdInput || crypto.randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: user.id, familyId },
      {
        secret: refreshTokenSecret,
        expiresIn: refreshTokenExpiresIn as any,
      },
    );

    const tokenHash = this.hashToken(refreshToken);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + thirtyDaysMs);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        familyId,
        expiresAt,
      },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: thirtyDaysMs,
    });

    return {
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      },
    };
  }

  /**
   * Scheduled job to purge expired or already used OTP logs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredOtpLogs() {
    try {
      const result = await this.prisma.otpLog.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }],
        },
      });
      this.logger.log(`[OTP CLEANUP] Purged ${result.count} expired/used OTP records.`);
      return result;
    } catch (error) {
      this.logger.error(`[OTP CLEANUP ERROR] Failed to purge OTP records: ${error?.message || error}`);
    }
  }
}
