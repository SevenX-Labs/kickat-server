import { IsUUID } from 'class-validator';

export class WishlistProductIdParamDto {
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;
}
