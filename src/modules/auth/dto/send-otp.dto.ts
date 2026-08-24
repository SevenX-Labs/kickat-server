import { IsEnum, Matches, IsNotEmpty, IsOptional } from 'class-validator';

export enum OtpChannelType {
  SMS = 'sms',
}

export class SendOtpDto {
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^(\+91)?[6-9]\d{9}$/, {
    message: 'phone must be 10 digits starting with 6-9, optionally prefixed with +91',
  })
  phone: string;

  @IsOptional()
  @IsEnum(OtpChannelType, { message: 'type must be sms' })
  type?: OtpChannelType = OtpChannelType.SMS;
}
