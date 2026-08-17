import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminForgotPasswordDto } from './dto/admin-forgot-password.dto';
import { AdminVerifyOtpDto } from './dto/admin-verify-otp.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminLogoutDto } from './dto/admin-logout.dto';
import { AdminSessionParamDto } from './dto/admin-session-param.dto';
import { AdminAuth, CurrentUser } from '../../../common';
import { Admin } from '@prisma/client';
import { Request } from 'express';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/admin/auth/login
   */
  @Post('login')
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  /**
   * POST /api/v1/admin/auth/forgot-password
   */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: AdminForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /api/v1/admin/auth/verify-reset-otp
   */
  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() dto: AdminVerifyOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  /**
   * POST /api/v1/admin/auth/reset-password
   */
  @Post('reset-password')
  async resetPassword(@Body() dto: AdminResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * POST /api/v1/admin/auth/change-password
   */
  @AdminAuth()
  @Post('change-password')
  async changePassword(
    @CurrentUser() admin: Admin,
    @Body() dto: AdminChangePasswordDto,
  ) {
    return this.authService.changePassword(admin, dto);
  }

  /**
   * POST /api/v1/admin/auth/logout
   */
  @AdminAuth()
  @Post('logout')
  async logout(@Body() dto: AdminLogoutDto) {
    return this.authService.logout(dto);
  }

  /**
   * GET /api/v1/admin/auth/me
   */
  @AdminAuth()
  @Get('me')
  async getMe(@CurrentUser() admin: Admin) {
    return this.authService.getMe(admin);
  }

  /**
   * GET /api/v1/admin/auth/sessions
   */
  @AdminAuth()
  @Get('sessions')
  async getSessions(@CurrentUser() admin: Admin) {
    return this.authService.getSessions(admin);
  }

  /**
   * DELETE /api/v1/admin/auth/sessions/:sessionId
   */
  @AdminAuth()
  @Delete('sessions/:sessionId')
  async deleteSession(
    @CurrentUser() admin: Admin,
    @Param() params: AdminSessionParamDto,
    @Req() req: Request,
  ) {
    return this.authService.deleteSession(admin, params.sessionId, req);
  }
}
