import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ReviewSortEnum {
  NEWEST = 'newest',
  HELPFUL = 'helpful',
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

export class GetReviewsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(ReviewSortEnum, {
    message: 'sort must be one of: newest, helpful, highest, lowest',
  })
  sort?: ReviewSortEnum = ReviewSortEnum.NEWEST;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasPhotos?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  verifiedOnly?: boolean;
}
