import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
export class UsersController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Post('me/recently-viewed')
  async addRecentlyViewed(
    @CurrentUser('id') userId: string,
    @Body('productId') productId: string,
  ) {
    return this.usersService.addRecentlyViewed(userId, productId);
  }

  @Get('me/recently-viewed')
  async getRecentlyViewed(@CurrentUser('id') userId: string) {
    return this.usersService.getRecentlyViewed(userId);
  }

  @Post('email/send-verification')
  @HttpCode(HttpStatus.OK)
  async sendEmailVerification(
    @CurrentUser('id') userId: string,
    @Body() dto: SendEmailVerificationDto,
  ) {
    return this.usersService.sendEmailVerification(userId, dto);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyEmailVerificationDto,
  ) {
    return this.usersService.verifyEmail(userId, dto);
  }

  @Post('mobile/send-verification')
  @HttpCode(HttpStatus.OK)
  async sendMobileVerification(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMobileVerificationDto,
  ) {
    return this.usersService.sendMobileVerification(userId, dto);
  }

  @Post('mobile/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMobile(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyMobileVerificationDto,
  ) {
    return this.usersService.verifyMobile(userId, dto);
  }
}
