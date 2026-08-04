import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutAllDto {
  @IsOptional()
  @IsString({ message: 'password must be a string' })
  password?: string;
}
