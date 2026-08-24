import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMobileVerificationDto {
  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Indian mobile phone number starting with +91 followed by 10 digits. Optional if user already has a phone saved.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+91)?[6-9]\d{9}$/, {
    message: 'phone must be 10 digits starting with 6-9, optionally prefixed with +91',
  })
  phone?: string;
}

export class VerifyMobileVerificationDto {
  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Indian mobile phone number being verified. Optional if user already has a phone saved.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+91)?[6-9]\d{9}$/, {
    message: 'phone must be 10 digits starting with 6-9, optionally prefixed with +91',
  })
  phone?: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code received via SMS',
  })
  @IsString()
  @IsNotEmpty({ message: 'otp is required' })
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
