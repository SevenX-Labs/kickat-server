import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @IsNotEmpty({ message: 'productId is required' })
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;

  @IsOptional()
  @IsUUID('4', { message: 'variantId must be a valid UUID v4' })
  variantId?: string;

  @IsNotEmpty({ message: 'quantity is required' })
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(100, { message: 'quantity cannot exceed 100' })
  quantity: number;
}
