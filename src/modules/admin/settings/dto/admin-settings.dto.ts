import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SocialLinksDto {
  @IsOptional()
  @IsUrl({}, { message: 'instagram must be a valid URL' })
  instagram?: string;

  @IsOptional()
  @IsUrl({}, { message: 'facebook must be a valid URL' })
  facebook?: string;

  @IsOptional()
  @IsUrl({}, { message: 'youtube must be a valid URL' })
  youtube?: string;

  @IsOptional()
  @IsUrl({}, { message: 'twitter must be a valid URL' })
  twitter?: string;

  @IsOptional()
  @IsUrl({}, { message: 'linkedin must be a valid URL' })
  linkedin?: string;
}

export class UpdateGeneralSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;

  @IsOptional()
  @IsEmail({}, { message: 'supportEmail must be a valid email address' })
  supportEmail?: string;

  @IsOptional()
  @IsString({ message: 'supportPhone must be a string' })
  supportPhone?: string;

  @IsOptional()
  @IsBoolean({ message: 'maintenanceMode must be a boolean' })
  maintenanceMode?: boolean;
}

export class CodConfigDto {
  @IsOptional()
  @IsBoolean({ message: 'enabled must be a boolean' })
  enabled?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'extraFee must be a number' })
  @Min(0, { message: 'extraFee must be a non-negative number' })
  extraFee?: number;
}

export class SimpleGatewayConfigDto {
  @IsOptional()
  @IsBoolean({ message: 'enabled must be a boolean' })
  enabled?: boolean;
}

export class UpdatePaymentSettingsDto {
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
  card?: SimpleGatewayConfigDto;
}

export class UpdateTaxSettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'gstEnabled must be a boolean' })
  gstEnabled?: boolean;

  @IsOptional()
  @IsString({ message: 'gstNumber must be a string' })
  gstNumber?: string;

  @IsOptional()
  @IsNumber({}, { message: 'gstPercentage must be a number' })
  @Min(0, { message: 'gstPercentage cannot be negative' })
  @Max(100, { message: 'gstPercentage cannot exceed 100' })
  gstPercentage?: number;
}

export class UpdateDeliverySettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'deliveryFeeEnabled must be a boolean' })
  deliveryFeeEnabled?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'deliveryFee must be a number' })
  @Min(0, { message: 'deliveryFee cannot be negative' })
  deliveryFee?: number;

  @IsOptional()
  @IsNumber({}, { message: 'freeDeliveryThreshold must be a number' })
  @Min(0, { message: 'freeDeliveryThreshold cannot be negative' })
  freeDeliveryThreshold?: number;
}

export class UpdateAllSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGeneralSettingsDto)
  general?: UpdateGeneralSettingsDto;

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
