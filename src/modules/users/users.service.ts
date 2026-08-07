import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common';
import {
  SendEmailVerificationDto,
  VerifyEmailVerificationDto,
} from './dto/email-verification.dto';
import {
  SendMobileVerificationDto,
  VerifyMobileVerificationDto,
} from './dto/mobile-verification.dto';
import { OtpType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async addRecentlyViewed(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.recentlyViewed.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      create: { userId, productId },
      update: { createdAt: new Date() },
    });

    // Enforce maximum 20 items per user
    const userViews = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (userViews.length > 20) {
      const idsToDelete = userViews.slice(20).map((v) => v.id);
      await this.prisma.recentlyViewed.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return {
      success: true,
      message: 'Product added to recently viewed',
    };
  }

  async getRecentlyViewed(userId: string) {
    const views = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return {
      success: true,
      products: views.map((v) => v.product),
    };
  }

  /**
   * POST /users/email/send-verification
   */
  async sendEmailVerification(userId: string, dto: SendEmailVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const email = dto.email ? dto.email.trim().toLowerCase() : user.email;
    if (!email) {
      throw new BadRequestException(
        'Email address is required to send verification code',
      );
    }

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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpLog.create({
      data: {
        identifier: email,
        otpHash,
        type: OtpType.EMAIL,
        expiresAt,
      },
    });

    await this.emailService.sendOtpEmail(email, otp);

    return {
      success: true,
      message: `Verification OTP sent successfully to ${email}`,
    };
  }

  /**
   * POST /users/email/verify
   */
  async verifyEmail(userId: string, dto: VerifyEmailVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetEmail = dto.email ? dto.email.trim().toLowerCase() : user.email;
    if (!targetEmail) {
      throw new BadRequestException(
        'Email address is required for verification',
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const attemptsCount = await this.prisma.otpLog.aggregate({
      where: {
        identifier: targetEmail,
        type: OtpType.EMAIL,
        createdAt: { gte: oneHourAgo },
      },
      _sum: { attempts: true },
    });

    if ((attemptsCount._sum.attempts || 0) >= 5) {
      throw new HttpException(
        'Too many attempts — max 5 per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latestOtp = await this.prisma.otpLog.findFirst({
      where: {
        identifier: targetEmail,
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

    await this.prisma.otpLog.update({
      where: { id: latestOtp.id },
      data: { isUsed: true },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: targetEmail,
        isEmailVerified: true,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isPhoneVerified: true,
        isEmailVerified: true,
        isProfileComplete: true,
      },
    });

    return {
      success: true,
      message: 'Email verified successfully.',
      user: updatedUser,
    };
  }

  /**
   * POST /users/mobile/send-verification
   */
  async sendMobileVerification(
    userId: string,
    dto: SendMobileVerificationDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const phone = dto.phone || user.phone;
    if (!phone) {
      throw new BadRequestException(
        'Phone number is required to send verification code',
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await this.prisma.otpLog.count({
      where: {
        identifier: phone,
        type: OtpType.SMS,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtpCount >= 5) {
      throw new HttpException(
        'Rate limit exceeded — max 5 per hour per identifier',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000);

    await this.prisma.otpLog.create({
      data: {
        identifier: phone,
        otpHash,
        type: OtpType.SMS,
        expiresAt,
      },
    });

    this.logger.log(`[MOBILE VERIFICATION OTP SENT] To: ${phone} | OTP: ${otp}`);

    return {
      success: true,
      message: `Mobile verification OTP sent successfully to ${phone}`,
    };
  }

  /**
   * POST /users/mobile/verify
   */
  async verifyMobile(userId: string, dto: VerifyMobileVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetPhone = dto.phone || user.phone;
    if (!targetPhone) {
      throw new BadRequestException('Phone number is required for verification');
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const attemptsCount = await this.prisma.otpLog.aggregate({
      where: {
        identifier: targetPhone,
        type: OtpType.SMS,
        createdAt: { gte: oneHourAgo },
      },
      _sum: { attempts: true },
    });

    if ((attemptsCount._sum.attempts || 0) >= 5) {
      throw new HttpException(
        'Too many attempts — max 5 per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latestOtp = await this.prisma.otpLog.findFirst({
      where: {
        identifier: targetPhone,
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

    await this.prisma.otpLog.update({
      where: { id: latestOtp.id },
      data: { isUsed: true },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: targetPhone,
        isPhoneVerified: true,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isPhoneVerified: true,
        isEmailVerified: true,
        isProfileComplete: true,
      },
    });

    return {
      success: true,
      message: 'Phone verified successfully.',
      user: updatedUser,
    };
  }
}
