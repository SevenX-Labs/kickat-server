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
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LogoutAllDto } from './dto/logout-all.dto';
import { OtpType, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OAuth2Client } from 'google-auth-library';
import { Response } from 'express';
import { EmailService } from '../../common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
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
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute expiry

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
    const targetIdentifier = dto.phone || dto.identifier;
    if (!targetIdentifier) {
      throw new BadRequestException('phone or identifier is required');
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Rate limit verification attempts per hour per phone
    const attemptsCount = await this.prisma.otpLog.aggregate({
      where: {
        identifier: targetIdentifier,
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
        identifier: targetIdentifier,
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

    // Check if user already exists
    let user = await this.prisma.user.findFirst({
      where: { phone: targetIdentifier },
    });

    let isNewUser = false;

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
      });
    } else {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: { phone: targetIdentifier, isPhoneVerified: true },
      });
    }

    return this.generateTokensAndRespond(user, res, undefined, isNewUser);
  }

  /**
   * POST /auth/email-otp/send (Send 6-digit OTP to Email)
   */
  async sendEmailOtp(dto: SendEmailOtpDto) {
    const email = dto.email.trim().toLowerCase();

    // Rate limit: max 5 OTP requests per hour per email
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await this.prisma.otpLog.count({
      where: {
        identifier: email,
        type: OtpType.EMAIL,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtpCount >= 5) {
      throw new HttpException(
        'Rate limit exceeded — max 5 OTP requests per hour per email',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute expiry

    await this.prisma.otpLog.create({
      data: {
        identifier: email,
        otpHash,
        type: OtpType.EMAIL,
        expiresAt,
      },
    });

    // Send email using EmailService
    await this.emailService.sendOtpEmail(email, otp);

    return {
      success: true,
      message: `OTP sent successfully to ${email}`,
    };
  }

  /**
   * POST /auth/email-otp/verify (Verify Email OTP)
   */
  async verifyEmailOtp(dto: VerifyEmailOtpDto, res: Response, currentUser?: any) {
    const email = dto.email.trim().toLowerCase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Rate limit verification attempts per hour per email
    const attemptsCount = await this.prisma.otpLog.aggregate({
      where: {
        identifier: email,
        type: OtpType.EMAIL,
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
        identifier: email,
        type: OtpType.EMAIL,
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

    // Case 1: Logged-in user linking/verifying their email
    if (currentUser?.id) {
      const updatedUser = await this.prisma.user.update({
        where: { id: currentUser.id },
        data: {
          email,
          isEmailVerified: true,
        },
      });
      return {
        success: true,
        message: 'Email verified successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          isEmailVerified: updatedUser.isEmailVerified,
          isPhoneVerified: updatedUser.isPhoneVerified,
        },
      };
    }

    // Case 2: Direct authentication / sign up via Email OTP
    let user = await this.prisma.user.findFirst({
      where: { email },
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          email,
          isEmailVerified: true,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
    }

    return this.generateTokensAndRespond(user, res, undefined, isNewUser);
  }

  private readonly googleAuthIpMap = new Map<string, { count: number; resetAt: number }>();

  getGoogleLoginUrl(): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:3000/api/v1/auth/callback/google';
    const scope = encodeURIComponent('openid email profile');
    return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&access_type=offline&prompt=consent`;
  }

  /**
   * POST /auth/google (Gmail Login)
   */
  async googleAuth(dto: GoogleAuthDto, req: any, res: Response) {
    const clientIp =
      req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour

    const rateRecord = this.googleAuthIpMap.get(clientIp);
    if (rateRecord) {
      if (now < rateRecord.resetAt) {
        if (rateRecord.count >= 10) {
          throw new HttpException(
            'Rate limit exceeded — max 10 Google auth requests per hour per IP',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        rateRecord.count++;
      } else {
        this.googleAuthIpMap.set(clientIp, { count: 1, resetAt: now + windowMs });
      }
    } else {
      this.googleAuthIpMap.set(clientIp, { count: 1, resetAt: now + windowMs });
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google OAuth client environment variables not configured');
    }

    try {
      const redirectUri =
        dto.redirectUri ||
        this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/api/v1/auth/callback/google';
      const client = new OAuth2Client(clientId, clientSecret, redirectUri);
      let idToken = dto.code;
      if (dto.code.startsWith('4/') || !dto.code.includes('.')) {
        const { tokens } = await client.getToken(dto.code);
        if (!tokens.id_token) {
          throw new UnauthorizedException('Google verification failed, invalid code or id_token');
        }
        idToken = tokens.id_token;
      }

      const ticket = await client.verifyIdToken({
        idToken,
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

      let isNewUser = false;

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: payload.sub,
            name: user.name || payload.name,
          },
        });
      } else {
        isNewUser = true;
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            googleId: payload.sub,
            name: payload.name,
            isEmailVerified: false,
          },
        });
      }

      return this.generateTokensAndRespond(user, res, undefined, isNewUser);
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
    isNewUser: boolean = false,
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
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        isNewUser,
        profileCompleted: user.isProfileComplete,
        isProfileComplete: user.isProfileComplete,
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
