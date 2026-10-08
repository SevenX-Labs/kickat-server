import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Body for POST /customer/activity/view.
 * Only the productId comes from the client — userId is taken from the JWT.
 */
export class RecordViewDto {
  @IsNotEmpty({ message: 'productId is required' })
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;
}
