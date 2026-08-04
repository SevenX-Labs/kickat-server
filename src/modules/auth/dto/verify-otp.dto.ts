import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { OtpChannelType } from './send-otp.dto';

export class VerifyOtpDto {
  @IsOptional()
  @IsString({ message: 'phone must be a string' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'identifier must be a string' })
  identifier?: string;

  @IsNotEmpty({ message: 'otp is required' })
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;

  @IsOptional()
  @IsEnum(OtpChannelType, { message: 'type must be sms' })
  type?: OtpChannelType = OtpChannelType.SMS;
}
