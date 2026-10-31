import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export enum CheckoutPaymentMethodEnum {
  UPI = "UPI",
  CARD = "CARD",
  WALLET = "WALLET",
  NETBANKING = "NETBANKING",
  COD = "COD",
}

export enum WalletProviderEnum {
  GPAY = "GPAY",
  PHONEPE = "PHONEPE",
  PAYTM = "PAYTM",
  AMAZON_PAY = "AMAZON_PAY",
}


export class BuyNowItemDto {
  @IsNotEmpty({ message: "productId is required" })
  @IsUUID("4", { message: "productId must be a valid UUID v4" })
  productId: string;

  @IsOptional()
  @IsUUID("4", { message: "variantId must be a valid UUID v4" })
  variantId?: string;

  @IsNotEmpty({ message: "quantity is required" })
  @IsNumber({}, { message: "quantity must be a number" })
  @Min(1, { message: "quantity must be at least 1" })
  quantity: number;
}

export class PlaceOrderDto {
  @IsNotEmpty({ message: "addressId is required" })
  @IsUUID("4", { message: "addressId must be a valid UUID v4" })
  addressId: string;

  @IsNotEmpty({ message: "paymentMethod is required" })
  @IsEnum(CheckoutPaymentMethodEnum, {
    message: "paymentMethod must be UPI, CARD, WALLET, NETBANKING, or COD",
  })
  paymentMethod: CheckoutPaymentMethodEnum;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  deliveryInstructions?: string;

  @IsOptional()
  @IsString({ message: "upiId must be a string" })
  upiId?: string;

  @IsOptional()
  @IsUUID("4", { message: "savedCardId must be a valid UUID v4" })
  savedCardId?: string;

  @IsOptional()
  @IsEnum(WalletProviderEnum, {
    message: "walletProvider must be GPAY, PHONEPE, PAYTM, or AMAZON_PAY",
  })
  walletProvider?: WalletProviderEnum;

  @IsOptional()
  @IsString({ message: "bankCode must be a string" })
  bankCode?: string;

  @IsOptional()
  @IsNumber({}, { message: "expectedTotal must be a number" })
  @Min(0, { message: "expectedTotal cannot be negative" })
  expectedTotal?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BuyNowItemDto)
  buyNowItem?: BuyNowItemDto;

  @IsOptional()
  @IsBoolean({ message: "applyExtraFee must be a boolean" })
  applyExtraFee?: boolean;
}
