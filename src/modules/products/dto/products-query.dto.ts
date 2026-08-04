import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ProductCatalogSortEnum {
  POPULARITY = 'popularity',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
  RATING = 'rating',
}

export enum PetSpeciesCatalogEnum {
  DOG = 'dog',
  CAT = 'cat',
  BIRD = 'bird',
  FISH = 'fish',
  RABBIT = 'rabbit',
  OTHER = 'other',
}

export enum DietCatalogEnum {
  VEG = 'veg',
  NON_VEG = 'non_veg',
}

export class ProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(50, { message: 'limit cannot exceed 50' })
  limit?: number = 10;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID v4' })
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductCatalogSortEnum, {
    message: 'sort must be popularity, price_asc, price_desc, newest, or rating',
  })
  sort?: ProductCatalogSortEnum = ProductCatalogSortEnum.NEWEST;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'priceMin must be a number' })
  @Min(0, { message: 'priceMin cannot be negative' })
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'priceMax must be a number' })
  @Min(0, { message: 'priceMax cannot be negative' })
  priceMax?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'inStock must be a boolean' })
  inStock?: boolean;

  @IsOptional()
  @IsString({ message: 'brand must be a string' })
  brand?: string;

  @IsOptional()
  @IsEnum(PetSpeciesCatalogEnum, {
    message: 'petSpecies must be dog, cat, bird, fish, rabbit, or other',
  })
  petSpecies?: PetSpeciesCatalogEnum;

  @IsOptional()
  @IsEnum(DietCatalogEnum, { message: 'diet must be veg or non_veg' })
  diet?: DietCatalogEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'rating must be an integer' })
  @Min(1, { message: 'rating must be at least 1' })
  @Max(5, { message: 'rating cannot exceed 5' })
  rating?: number;
}
