import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import * as fs from 'fs';
import * as path from 'path';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LogoutAllDto } from './dto/logout-all.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @SkipThrottle()
  @Get('google-test')
  googleTestPage(@Res() res: any) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Route not found');
    }
    const htmlPath = path.resolve(process.cwd(), 'google-auth-test.html');
    if (!fs.existsSync(htmlPath)) {
      throw new NotFoundException('Test page not found');
    }
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlContent);
  }

  @SkipThrottle()
  @Get('login/google')
  googleLogin(@Res() res: any) {
    const url = this.authService.getGoogleLoginUrl();
    return res.redirect(url);
  }

  @SkipThrottle()
  @Get('callback/google')
  async googleCallback(
    @Query('code') code: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code missing from Google callback');
    }
    const redirectUri =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:3000/api/v1/auth/callback/google';
    return this.authService.googleAuth({ code, redirectUri }, req, res);
  }

  @Throttle({
    'otp-send-short': { limit: 3, ttl: 600000 },
    'otp-send-long': { limit: 20, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
  })
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Throttle({
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 20, ttl: 3600000 },
  })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.authService.verifyOtp(dto, res);
  }

  @Throttle({
    'otp-send-short': { limit: 3, ttl: 600000 },
    'otp-send-long': { limit: 20, ttl: 3600000 },
    'otp-verify': { limit: 10000, ttl: 3600000 },
  })
  @Post('email-otp/send')
  @HttpCode(HttpStatus.OK)
  async sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(dto);
  }

  @Throttle({
    'otp-send-short': { limit: 10000, ttl: 600000 },
    'otp-send-long': { limit: 10000, ttl: 3600000 },
    'otp-verify': { limit: 20, ttl: 3600000 },
  })
  @Post('email-otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Res({ passthrough: true }) res: any,
    @Req() req: any,
  ) {
    return this.authService.verifyEmailOtp(dto, res, req?.user);
  }

  @SkipThrottle()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.authService.googleAuth(dto, req, res);
  }

  @SkipThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    return this.authService.refreshToken(refreshToken, res);
  }

  @SkipThrottle()
  @Auth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: any,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    return this.authService.logout(user, refreshToken, res);
  }

  @SkipThrottle()
  @Auth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: any,
    @Body() dto: LogoutAllDto,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.authService.logoutAll(user, dto, res);
  }
}
