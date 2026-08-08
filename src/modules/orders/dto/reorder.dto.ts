import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderItemDto {
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;

  @IsOptional()
  @IsUUID('4', { message: 'variantId must be a valid UUID v4' })
  variantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(100, { message: 'quantity cannot exceed 100' })
  quantity?: number = 1;
}

export class ReorderDto {
  @IsOptional()
  @IsUUID('4', { message: 'orderId must be a valid UUID v4' })
  orderId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'variantId must be a valid UUID v4' })
  variantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(100, { message: 'quantity cannot exceed 100' })
  quantity?: number = 1;

  @IsOptional()
  @IsArray({ message: 'items must be an array' })
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items?: ReorderItemDto[];
}
