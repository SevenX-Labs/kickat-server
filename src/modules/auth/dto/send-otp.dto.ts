import { IsEnum, Matches, IsNotEmpty, IsOptional } from 'class-validator';

export enum OtpChannelType {
  SMS = 'sms',
}

export class SendOtpDto {
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^\+91[6-9]\d{9}$/, {
    message: 'phone must be +91 followed by exactly 10 digits starting with 6-9',
  })
  phone: string;

  @IsOptional()
  @IsEnum(OtpChannelType, { message: 'type must be sms' })
  type?: OtpChannelType = OtpChannelType.SMS;
}
