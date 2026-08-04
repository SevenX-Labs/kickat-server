import { IsISO8601, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class DeliverySlotsQueryDto {
  @IsNotEmpty({ message: 'pincode is required' })
  @Matches(/^\d{6}$/, { message: 'pincode must be exactly 6 digits' })
  pincode: string;

  @IsOptional()
  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date string' })
  date?: string;
}
