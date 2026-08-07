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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google-test')
  googleTestPage(@Res() res: any) {
    const htmlPath = path.resolve(process.cwd(), 'google-auth-test.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlContent);
  }

  @Get('login/google')
  googleLogin(@Res() res: any) {
    const url = this.authService.getGoogleLoginUrl();
    return res.redirect(url);
  }

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

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.authService.verifyOtp(dto, res);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.authService.googleAuth(dto, req, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    return this.authService.refreshToken(refreshToken, res);
  }

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
