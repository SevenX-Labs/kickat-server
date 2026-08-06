import { Body, Controller, Get, Post } from '@nestjs/common';
import { Auth, CurrentUser } from '../../common';
import { ProfileService } from '../profile/profile.service';
import { UsersService } from './users.service';

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
}
