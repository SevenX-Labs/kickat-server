import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewStatusEnum } from '@prisma/client';

export enum AdminReviewSortEnum {
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  RATING_DESC = 'rating_desc',
  RATING_ASC = 'rating_asc',
  HELPFUL_DESC = 'helpfulCount_desc',
}

export class AdminReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ReviewStatusEnum)
  status?: ReviewStatusEnum;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isSpam?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AdminReviewSortEnum)
  sort?: AdminReviewSortEnum = AdminReviewSortEnum.CREATED_AT_DESC;
}

export class UpdateReviewStatusDto {
  @IsEnum(ReviewStatusEnum)
  status: ReviewStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

export class AdminReplyReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reply: string;
}

export class ToggleReviewSpamDto {
  @IsBoolean()
  @Type(() => Boolean)
  isSpam: boolean;
}
