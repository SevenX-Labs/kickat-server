import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export enum SavedPaymentMethodTypeDto {
  UPI = "UPI",
  BANK_ACCOUNT = "BANK_ACCOUNT",
  CARD = "CARD",
}

export class CreatePaymentMethodDto {
  @IsNotEmpty({ message: "type is required" })
  @IsEnum(SavedPaymentMethodTypeDto, { message: "type must be UPI, BANK_ACCOUNT, or CARD" })
  type: SavedPaymentMethodTypeDto;

  @IsOptional()
  @IsString({ message: "upiId must be a string" })
  @Matches(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, {
    message: "Invalid UPI ID format (e.g. name@upi or 9876543210@paytm)",
  })
  upiId?: string;

  @IsOptional()
  @IsString({ message: "accountNumber must be a string" })
  @MaxLength(30, { message: "accountNumber must not exceed 30 characters" })
  accountNumber?: string;

  @IsOptional()
  @IsString({ message: "ifscCode must be a string" })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: "Invalid IFSC Code format (e.g. SBIN0001234)" })
  ifscCode?: string;

  @IsOptional()
  @IsString({ message: "accountHolderName must be a string" })
  @MaxLength(100, { message: "accountHolderName must not exceed 100 characters" })
  accountHolderName?: string;

  @IsOptional()
  @IsString({ message: "bankName must be a string" })
  @MaxLength(100, { message: "bankName must not exceed 100 characters" })
  bankName?: string;

  @IsOptional()
  @IsString({ message: "cardLast4 must be a string" })
  @MaxLength(4, { message: "cardLast4 must be 4 digits" })
  cardLast4?: string;

  @IsOptional()
  @IsString({ message: "cardNetwork must be a string" })
  cardNetwork?: string;

  @IsOptional()
  @IsBoolean({ message: "isDefault must be a boolean" })
  isDefault?: boolean;
}
