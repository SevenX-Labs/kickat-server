import { IsOptional, IsString } from 'class-validator';

export class AdminRefreshTokenDto {
  @IsOptional()
  @IsString({ message: 'refreshToken must be a string' })
  refreshToken?: string;
}
