import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CancelReasonEnum {
  CHANGED_MIND = 'changed_mind',
  ORDERED_BY_MISTAKE = 'ordered_by_mistake',
  FOUND_CHEAPER = 'found_cheaper',
  OTHER = 'other',
}

export class CancelOrderDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(CancelReasonEnum, {
    message:
      'reason must be one of: changed_mind, ordered_by_mistake, found_cheaper, other',
  })
  reason: CancelReasonEnum;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'reasonOther must not exceed 200 characters' })
  reasonOther?: string;
}
