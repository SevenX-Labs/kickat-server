import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsNotEmpty({ message: 'quantity is required' })
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(100, { message: 'quantity cannot exceed 100' })
  quantity: number;
}
