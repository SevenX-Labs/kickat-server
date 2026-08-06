import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum PaymentMethodType {
  UPI = 'upi',
  CARD = 'card',
  WALLET = 'wallet',
  NETBANKING = 'netbanking',
  COD = 'cod',
}

export class CreatePaymentOrderDto {
  @IsUUID('4', { message: 'orderId must be a valid UUID v4' })
  orderId: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(PaymentMethodType, {
    message:
      'paymentMethod must be one of: upi, card, wallet, netbanking, cod',
  })
  paymentMethod: PaymentMethodType;

  @IsOptional()
  @IsString()
  upiId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'savedCardId must be a valid UUID v4' })
  savedCardId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  walletProvider?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;
}
