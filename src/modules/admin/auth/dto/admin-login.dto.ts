import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString({ message: 'adminId must be a string' })
  @IsNotEmpty({ message: 'adminId is required' })
  @Matches(/^[a-zA-Z0-9]{4,20}$/, {
    message: 'adminId must be alphanumeric and between 4 and 20 characters',
  })
  adminId: string;

  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password is required' })
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password: string;
}
