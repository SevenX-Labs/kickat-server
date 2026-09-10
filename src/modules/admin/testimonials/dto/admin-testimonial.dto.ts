import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum AdminTestimonialSortEnum {
  ORDER_ASC = "order_asc",
  ORDER_DESC = "order_desc",
  CREATED_AT_DESC = "createdAt_desc",
  CREATED_AT_ASC = "createdAt_asc",
  RATING_DESC = "rating_desc",
  RATING_ASC = "rating_asc",
}

export class CreateTestimonialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number = 5;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  petName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  petType?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean = true;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number = 0;
}

export class UpdateTestimonialDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  petName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  petType?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}

export class AdminTestimonialsQueryDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  sort?: AdminTestimonialSortEnum = AdminTestimonialSortEnum.ORDER_ASC;
}

export class ToggleTestimonialStatusDto {
  @IsBoolean()
  @Type(() => Boolean)
  isActive: boolean;
}

export class TestimonialReorderItemDto {
  @IsUUID("4")
  id: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  order: number;
}

export class ReorderTestimonialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestimonialReorderItemDto)
  items: TestimonialReorderItemDto[];
}
