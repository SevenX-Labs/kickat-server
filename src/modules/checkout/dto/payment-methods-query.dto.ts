import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Matches, Min } from 'class-validator';

export class PaymentMethodsQueryDto {
  @IsNotEmpty({ message: 'orderAmount is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'orderAmount must be a number' })
  @Min(0.01, { message: 'orderAmount must be greater than 0' })
  orderAmount: number;

  @IsNotEmpty({ message: 'pincode is required' })
  @Matches(/^\d{6}$/, { message: 'pincode must be exactly 6 digits' })
  pincode: string;
}
