import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { Auth, CurrentUser } from '../../common';
import { ProfileService } from '../profile/profile.service';
import { UsersService } from './users.service';
import {
  SendEmailVerificationDto,
  VerifyEmailVerificationDto,
} from './dto/email-verification.dto';
import {
  SendMobileVerificationDto,
  VerifyMobileVerificationDto,
} from './dto/mobile-verification.dto';

@Auth()
@Controller('users')
@UseGuards(ThrottlerGuard)
export class UsersController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly usersService: UsersService,
  ) {}

  @SkipThrottle()
  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @SkipThrottle()
  @Post('me/recently-viewed')
  async addRecentlyViewed(
    @CurrentUser('id') userId: string,
    @Body('productId') productId: string,
  ) {
    return this.usersService.addRecentlyViewed(userId, productId);
  }

  @SkipThrottle()
  @Get('me/recently-viewed')
  async getRecentlyViewed(@CurrentUser('id') userId: string) {
    return this.usersService.getRecentlyViewed(userId);
  }

  @Throttle({
    'otp-send-short': { limit: 3, ttl: 600000 },
    'otp-send-long': { limit: 20, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
  })
  @Post('email/send-verification')
  @HttpCode(HttpStatus.OK)
  async sendEmailVerification(
    @CurrentUser('id') userId: string,
    @Body() dto: SendEmailVerificationDto,
  ) {
    return this.usersService.sendEmailVerification(userId, dto);
  }

  @Throttle({
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 20, ttl: 3600000 },
  })
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyEmailVerificationDto,
  ) {
    return this.usersService.verifyEmail(userId, dto);
  }

  @Throttle({
    'otp-send-short': { limit: 3, ttl: 600000 },
    'otp-send-long': { limit: 20, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
  })
  @Post('mobile/send-verification')
  @HttpCode(HttpStatus.OK)
  async sendMobileVerification(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMobileVerificationDto,
  ) {
    return this.usersService.sendMobileVerification(userId, dto);
  }

  @Throttle({
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 20, ttl: 3600000 },
  })
  @Post('mobile/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMobile(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyMobileVerificationDto,
  ) {
    return this.usersService.verifyMobile(userId, dto);
  }
}
