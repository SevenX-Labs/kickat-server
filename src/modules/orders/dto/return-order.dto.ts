import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum ReturnReasonEnum {
  WRONG_ITEM = 'wrong_item',
  DAMAGED = 'damaged',
  EXPIRED = 'expired',
  NOT_AS_DESCRIBED = 'not_as_described',
  OTHER = 'other',
}

export class ReturnItemDto {
  @IsUUID('4', { message: 'orderItemId must be a valid UUID v4' })
  orderItemId: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(ReturnReasonEnum, {
    message:
      'reason must be one of: wrong_item, damaged, expired, not_as_described, other',
  })
  reason: ReturnReasonEnum;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'reasonOther must not exceed 200 characters' })
  reasonOther?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'photos must not exceed 5 item URLs' })
  @IsUrl({}, { each: true, message: 'Each photo must be a valid URL' })
  photos?: string[];
}

export class ReturnOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'pickupInstructions must not exceed 500 characters',
  })
  pickupInstructions?: string;
}
