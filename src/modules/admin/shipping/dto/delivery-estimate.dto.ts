import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class DeliveryEstimateQueryDto {
  @IsNotEmpty({ message: 'Enter a valid 6-digit pincode.' })
  @IsString()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Enter a valid 6-digit pincode.' })
  pincode!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  weight?: string | number;

  @IsOptional()
  cod?: string | boolean;
}
