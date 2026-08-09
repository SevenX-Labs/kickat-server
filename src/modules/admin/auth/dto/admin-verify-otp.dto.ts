import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AdminVerifyOtpDto {
  @IsString({ message: 'adminId must be a string' })
  @IsNotEmpty({ message: 'adminId is required' })
  @Matches(/^[a-zA-Z0-9]{4,20}$/, {
    message: 'adminId must be alphanumeric and between 4 and 20 characters',
  })
  adminId: string;

  @IsString({ message: 'otp must be a string' })
  @IsNotEmpty({ message: 'otp is required' })
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
