import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export enum SearchSortEnum {
  RELEVANCE = 'relevance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
  RATING = 'rating',
}

export enum PetSpeciesSearchEnum {
  DOG = 'dog',
  CAT = 'cat',
  BIRD = 'bird',
  FISH = 'fish',
  RABBIT = 'rabbit',
  OTHER = 'other',
}

export enum DietSearchEnum {
  VEG = 'veg',
  NON_VEG = 'non_veg',
}

export class SearchQueryDto {
  @IsNotEmpty({ message: 'q is required' })
  @IsString({ message: 'q must be a string' })
  @Length(2, 100, { message: 'q must be between 2 and 100 characters' })
  q: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID v4' })
  categoryId?: string;

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
  @Type(() => Number)
  @IsInt({ message: 'rating must be an integer' })
  @Min(1, { message: 'rating must be at least 1' })
  @Max(5, { message: 'rating cannot exceed 5' })
  rating?: number;

  @IsOptional()
  @IsEnum(PetSpeciesSearchEnum, {
    message: 'petSpecies must be dog, cat, bird, fish, rabbit, or other',
  })
  petSpecies?: PetSpeciesSearchEnum;

  @IsOptional()
  @IsEnum(DietSearchEnum, { message: 'diet must be veg or non_veg' })
  diet?: DietSearchEnum;

  @IsOptional()
  @IsString({ message: 'brand must be a string' })
  brand?: string;

  @IsOptional()
  @IsEnum(SearchSortEnum, {
    message: 'sort must be relevance, price_asc, price_desc, newest, or rating',
  })
  sort?: SearchSortEnum = SearchSortEnum.RELEVANCE;

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
}
