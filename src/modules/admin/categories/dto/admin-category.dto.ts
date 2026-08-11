import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AdminCategorySortEnum {
  ORDER_ASC = 'order_asc',
  ORDER_DESC = 'order_desc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class AdminCategoriesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRoot?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  tree?: boolean;

  @IsOptional()
  @IsEnum(AdminCategorySortEnum)
  sort?: AdminCategorySortEnum = AdminCategorySortEnum.ORDER_ASC;
}

export class UpdateCategoryStatusDto {
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}

export class ReorderItemDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  @IsNotEmpty()
  items: ReorderItemDto[];
}
