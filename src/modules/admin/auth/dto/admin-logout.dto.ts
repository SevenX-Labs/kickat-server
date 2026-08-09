import { IsNotEmpty, IsString } from 'class-validator';

export class AdminLogoutDto {
  @IsString({ message: 'refreshToken must be a string' })
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken: string;
}
