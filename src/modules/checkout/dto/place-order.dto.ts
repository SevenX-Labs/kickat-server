import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export enum CheckoutPaymentMethodEnum {
  UPI = 'UPI',
  CARD = 'CARD',
  WALLET = 'WALLET',
  NETBANKING = 'NETBANKING',
  COD = 'COD',
}

export enum DeliverySlotEnum {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
  STANDARD = 'STANDARD',
}

export enum WalletProviderEnum {
  GPAY = 'GPAY',
  PHONEPE = 'PHONEPE',
  PAYTM = 'PAYTM',
  AMAZON_PAY = 'AMAZON_PAY',
}

export class DeliverySlotDto {
  @IsNotEmpty({ message: 'date is required' })
  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date string' })
  date: string;

  @IsNotEmpty({ message: 'slot is required' })
  @IsEnum(DeliverySlotEnum, {
    message: 'slot must be MORNING, EVENING, or STANDARD',
  })
  slot: DeliverySlotEnum;
}

export class PlaceOrderDto {
  @IsNotEmpty({ message: 'addressId is required' })
  @IsUUID('4', { message: 'addressId must be a valid UUID v4' })
  addressId: string;

  @IsNotEmpty({ message: 'deliverySlot is required' })
  @ValidateNested()
  @Type(() => DeliverySlotDto)
  deliverySlot: DeliverySlotDto;

  @IsNotEmpty({ message: 'paymentMethod is required' })
  @IsEnum(CheckoutPaymentMethodEnum, {
    message: 'paymentMethod must be UPI, CARD, WALLET, NETBANKING, or COD',
  })
  paymentMethod: CheckoutPaymentMethodEnum;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  couponCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  deliveryInstructions?: string;

  @IsOptional()
  @IsString({ message: 'upiId must be a string' })
  upiId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'savedCardId must be a valid UUID v4' })
  savedCardId?: string;

  @IsOptional()
  @IsEnum(WalletProviderEnum, {
    message: 'walletProvider must be GPAY, PHONEPE, PAYTM, or AMAZON_PAY',
  })
  walletProvider?: WalletProviderEnum;

  @IsOptional()
  @IsString({ message: 'bankCode must be a string' })
  bankCode?: string;
}
