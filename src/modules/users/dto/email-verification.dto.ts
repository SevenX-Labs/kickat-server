import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendEmailVerificationDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Email address to send verification OTP to. Optional if user already has an email saved.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;
}

export class VerifyEmailVerificationDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Email address being verified. Optional if user already has an email saved.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code received via email',
  })
  @IsString()
  @IsNotEmpty({ message: 'otp is required' })
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
