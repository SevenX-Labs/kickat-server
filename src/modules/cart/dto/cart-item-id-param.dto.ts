import { IsUUID } from 'class-validator';

export class CartItemIdParamDto {
  @IsUUID('4', { message: 'itemId must be a valid UUID v4' })
  itemId: string;
}
