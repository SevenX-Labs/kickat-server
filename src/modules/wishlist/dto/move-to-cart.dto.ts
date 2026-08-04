import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class MoveToCartDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity?: number = 1;
}
