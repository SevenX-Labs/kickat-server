import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;

  @IsUUID('4', { message: 'orderId must be a valid UUID v4' })
  orderId: string;

  @IsInt({ message: 'rating must be an integer' })
  @Min(1, { message: 'rating must be between 1 and 5' })
  @Max(5, { message: 'rating must be between 1 and 5' })
  rating: number;

  @IsString({ message: 'comment must be a string' })
  @MinLength(10, { message: 'comment must be at least 10 characters long' })
  @MaxLength(2000, { message: 'comment must not exceed 2000 characters' })
  comment: string;

  @IsOptional()
  @IsArray({ message: 'photos must be an array' })
  @ArrayMaxSize(5, { message: 'photos array can contain at most 5 URLs' })
  @IsUrl({}, { each: true, message: 'Each photo must be a valid URL' })
  photos?: string[];
}
