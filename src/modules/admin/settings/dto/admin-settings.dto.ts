import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SmtpConfigDto {
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsBoolean()
  isSecure?: boolean;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;
}

export class UpdateGeneralSettingsDto {
  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteDescription?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  supportPhone?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmtpConfigDto)
  smtp?: SmtpConfigDto;
}

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  legalBusinessName?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  currencySymbol?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  orderPrefix?: string;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  autoCancelUnpaidMinutes?: number;
}

export class RazorpayConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  keyId?: string;

  @IsOptional()
  @IsString()
  keySecret?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class CodConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraFee?: number;
}

export class SimpleGatewayConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RazorpayConfigDto)
  razorpay?: RazorpayConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CodConfigDto)
  cod?: CodConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimpleGatewayConfigDto)
  upi?: SimpleGatewayConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimpleGatewayConfigDto)
  wallet?: SimpleGatewayConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimpleGatewayConfigDto)
  card?: SimpleGatewayConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimpleGatewayConfigDto)
  netbanking?: SimpleGatewayConfigDto;
}

export class UpdateTaxSettingsDto {
  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  standardGstRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cgstRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sgstRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  igstRate?: number;

  @IsOptional()
  @IsObject()
  hsnCodes?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;
}

export class UpdateDeliverySettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardDeliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freeDeliveryThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  estimatedDeliveryDays?: number;

  @IsOptional()
  @IsString()
  defaultCourier?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedCouriers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliverySlots?: string[];

  @IsOptional()
  @IsBoolean()
  enableRtoTracking?: boolean;
}

export class UpdateAllSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGeneralSettingsDto)
  general?: UpdateGeneralSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStoreSettingsDto)
  store?: UpdateStoreSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePaymentSettingsDto)
  payment?: UpdatePaymentSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTaxSettingsDto)
  tax?: UpdateTaxSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDeliverySettingsDto)
  delivery?: UpdateDeliverySettingsDto;
}
