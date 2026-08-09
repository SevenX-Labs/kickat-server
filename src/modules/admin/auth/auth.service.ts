import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../../common';
import { Admin } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Request } from 'express';

import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminForgotPasswordDto } from './dto/admin-forgot-password.dto';
import { AdminVerifyOtpDto } from './dto/admin-verify-otp.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminLogoutDto } from './dto/admin-logout.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * POST /api/v1/admin/auth/login
   */
  async login(dto: AdminLoginDto, req: Request) {
    const admin = await this.prisma.admin.findUnique({
      where: { adminId: dto.adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Wrong credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Wrong credentials');
    }

    if (!admin.isActive || admin.isBlocked) {
      throw new ForbiddenException('Account is blocked or inactive');
    }

    const payload = {
      sub: admin.id,
      adminId: admin.adminId,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    };

    const accessTokenSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'default-access-secret';
    const refreshTokenSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'default-refresh-secret';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessTokenSecret,
      expiresIn: '1d',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshTokenSecret,
      expiresIn: '7d',
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.ip || undefined;
    const userAgent = req.headers['user-agent'] || undefined;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        refreshTokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    return {
      success: true,
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        adminId: admin.adminId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    };
  }

  /**
   * POST /api/v1/admin/auth/forgot-password
   */
  async forgotPassword(dto: AdminForgotPasswordDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { adminId: dto.adminId },
    });

    if (!admin) {
      throw new NotFoundException('adminId not found');
    }

    // Rate limit: max 3 per hour per adminId
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await this.prisma.adminResetToken.count({
      where: {
        adminId: admin.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtpCount >= 3) {
      throw new HttpException(
        'Rate limit exceeded — max 3 per hour per adminId',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.adminResetToken.create({
      data: {
        adminId: admin.id,
        otpHash,
        otpExpiresAt,
      },
    });

    this.logger.log(`[ADMIN OTP SENT] Admin: ${admin.adminId} (${admin.email}) | OTP: ${otp}`);

    await this.emailService.sendOtpEmail(admin.email, otp);

    return {
      success: true,
      message: `OTP sent successfully to email linked to adminId ${admin.adminId}`,
    };
  }

  /**
   * POST /api/v1/admin/auth/verify-reset-otp
   */
  async verifyResetOtp(dto: AdminVerifyOtpDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { adminId: dto.adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Wrong or expired OTP');
    }

    // Rate limit: max 5 attempts per hour per adminId
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAttemptsRecords = await this.prisma.adminResetToken.findMany({
      where: {
        adminId: admin.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    const totalAttempts = recentAttemptsRecords.reduce(
      (sum, r) => sum + r.attempts,
      0,
    );

    if (totalAttempts >= 5) {
      throw new HttpException(
        'Too many attempts — max 5 per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latestTokenRecord = await this.prisma.adminResetToken.findFirst({
      where: {
        adminId: admin.id,
        isUsed: false,
        otpExpiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestTokenRecord || !latestTokenRecord.otpHash) {
      throw new UnauthorizedException('Wrong or expired OTP');
    }

    const isOtpValid = await bcrypt.compare(
      dto.otp,
      latestTokenRecord.otpHash,
    );

    if (!isOtpValid) {
      await this.prisma.adminResetToken.update({
        where: { id: latestTokenRecord.id },
        data: { attempts: latestTokenRecord.attempts + 1 },
      });
      throw new UnauthorizedException('Wrong or expired OTP');
    }

    const resetToken = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.adminResetToken.update({
      where: { id: latestTokenRecord.id },
      data: {
        resetToken,
        tokenExpiresAt,
        isOtpVerified: true,
      },
    });

    return {
      success: true,
      resetToken,
      expiresAt: tokenExpiresAt,
    };
  }

  /**
   * POST /api/v1/admin/auth/reset-password
   */
  async resetPassword(dto: AdminResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('passwords do not match');
    }

    const tokenRecord = await this.prisma.adminResetToken.findUnique({
      where: { resetToken: dto.resetToken },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('invalid or expired resetToken');
    }

    if (tokenRecord.isUsed) {
      throw new GoneException('token already used');
    }

    if (!tokenRecord.tokenExpiresAt || tokenRecord.tokenExpiresAt < new Date()) {
      throw new UnauthorizedException('invalid or expired resetToken');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.admin.update({
        where: { id: tokenRecord.adminId },
        data: { password: hashedPassword },
      }),
      this.prisma.adminResetToken.update({
        where: { id: tokenRecord.id },
        data: { isUsed: true },
      }),
    ]);

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  /**
   * POST /api/v1/admin/auth/change-password
   */
  async changePassword(admin: Admin, dto: AdminChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('passwords do not match');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      admin.password,
    );

    if (!isCurrentValid) {
      throw new UnauthorizedException('wrong current password');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { password: hashedPassword },
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * POST /api/v1/admin/auth/logout
   */
  async logout(dto: AdminLogoutDto) {
    const refreshTokenHash = this.hashToken(dto.refreshToken);

    const session = await this.prisma.adminSession.findUnique({
      where: { refreshTokenHash },
    });

    if (session) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      });
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * GET /api/v1/admin/auth/me
   */
  async getMe(admin: Admin) {
    return {
      success: true,
      admin: {
        id: admin.id,
        adminId: admin.adminId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    };
  }

  /**
   * GET /api/v1/admin/auth/sessions
   */
  async getSessions(admin: Admin) {
    const sessions = await this.prisma.adminSession.findMany({
      where: {
        adminId: admin.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    };
  }

  /**
   * DELETE /api/v1/admin/auth/sessions/:sessionId
   */
  async deleteSession(admin: Admin, sessionId: string, req: Request) {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.adminId !== admin.id) {
      throw new NotFoundException('session not found');
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenHash = this.hashToken(token);
      if (session.refreshTokenHash === tokenHash) {
        throw new ConflictException('cannot delete current active session');
      }
    }

    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });

    return {
      success: true,
      message: 'Session terminated successfully',
    };
  }
}
