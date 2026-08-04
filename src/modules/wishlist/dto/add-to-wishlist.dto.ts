import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AddToWishlistDto {
  @IsNotEmpty({ message: 'productId is required' })
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;

  @IsOptional()
  @IsUUID('4', { message: 'variantId must be a valid UUID v4' })
  variantId?: string;
}
