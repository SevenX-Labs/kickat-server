import { Controller, Get } from '@nestjs/common';
import { Auth, CurrentUser } from '../../common';
import { ProfileService } from '../profile/profile.service';

@Controller('users')
export class UsersController {
  constructor(private readonly profileService: ProfileService) {}

  @Auth()
  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }
}
