import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  DietaryPreference,
  MediaType,
  PetSpecies,
  ProductStatusEnum,
} from '@prisma/client';

export enum AdminProductSortEnum {
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  STOCK_ASC = 'stock_asc',
  STOCK_DESC = 'stock_desc',
  RATING_DESC = 'rating_desc',
}

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number = 0;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number = 0;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class CreateMediaDto {
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType = MediaType.IMAGE;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;
}

export class UpdateMediaDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType = MediaType.IMAGE;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;
}


export class CustomProductAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  value: string;
}

export class ProductAttributesDto {
  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsString()
  lifeStage?: string;

  @IsOptional()
  @IsString()
  weight?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'Maximum 50 custom attributes allowed' })
  @ValidateNested({ each: true })
  @Type(() => CustomProductAttributeDto)
  custom?: CustomProductAttributeDto[];
}

export class ProductHighlightDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class NutritionItemDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class ProductIngredientsDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  items?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NutritionItemDto)
  nutrition?: NutritionItemDto[];
}

export class FeedingRowDto {
  @IsString()
  @IsNotEmpty()
  petWeight: string;

  @IsString()
  @IsNotEmpty()
  dailyAmount: string;
}

export class ProductFeedingGuideDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedingRowDto)
  rows?: FeedingRowDto[];
}

export class SizeItemDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class ProductSizeGuideDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SizeItemDto)
  sizes?: SizeItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(150, { message: 'Description title cannot exceed 150 characters' })
  descriptionTitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000, { message: 'Materials description cannot exceed 2000 characters' })
  materials?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number = 0;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  petSpecies?: PetSpecies;

  @IsOptional()
  @IsEnum(DietaryPreference)
  dietaryPreference?: DietaryPreference;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9, { message: 'A maximum of 9 product images is allowed' })
  @IsString({ each: true })
  images?: string[] = [];

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductAttributesDto)
  attributes?: ProductAttributesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductHighlightDto)
  highlights?: ProductHighlightDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductIngredientsDto)
  ingredients?: ProductIngredientsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductFeedingGuideDto)
  feedingGuide?: ProductFeedingGuideDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careInstructions?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSizeGuideDto)
  sizeGuide?: ProductSizeGuideDto;

  @IsOptional()
  @IsEnum(ProductStatusEnum)
  status?: ProductStatusEnum = ProductStatusEnum.ACTIVE;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean = false;

  @IsOptional()
  @IsBoolean()
  isBestSeller?: boolean = false;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMediaDto)
  media?: CreateMediaDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(150, { message: 'Description title cannot exceed 150 characters' })
  descriptionTitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000, { message: 'Materials description cannot exceed 2000 characters' })
  materials?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  petSpecies?: PetSpecies;

  @IsOptional()
  @IsEnum(DietaryPreference)
  dietaryPreference?: DietaryPreference;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9, { message: 'A maximum of 9 product images is allowed' })
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductAttributesDto)
  attributes?: ProductAttributesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductHighlightDto)
  highlights?: ProductHighlightDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductIngredientsDto)
  ingredients?: ProductIngredientsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductFeedingGuideDto)
  feedingGuide?: ProductFeedingGuideDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careInstructions?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSizeGuideDto)
  sizeGuide?: ProductSizeGuideDto;

  @IsOptional()
  @IsEnum(ProductStatusEnum)
  status?: ProductStatusEnum;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsOptional()
  @IsBoolean()
  isBestSeller?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMediaDto)
  media?: UpdateMediaDto[];
}

export class AdminProductsQueryDto {
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
  @IsEnum(ProductStatusEnum)
  status?: ProductStatusEnum;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  petSpecies?: PetSpecies;

  @IsOptional()
  @IsEnum(DietaryPreference)
  dietaryPreference?: DietaryPreference;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  inStock?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isLowStock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lowStockThreshold?: number = 10;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isTrending?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isBestSeller?: boolean;

  @IsOptional()
  @IsEnum(AdminProductSortEnum)
  sort?: AdminProductSortEnum = AdminProductSortEnum.CREATED_AT_DESC;
}

export class UpdateProductStatusDto {
  @IsEnum(ProductStatusEnum)
  @IsNotEmpty()
  status: ProductStatusEnum;
}

export class BulkProductStatusDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  productIds: string[];

  @IsEnum(ProductStatusEnum)
  @IsNotEmpty()
  status: ProductStatusEnum;
}

export class BulkProductDeleteDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  productIds: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  permanent?: boolean = false;
}

export class VariantStockUpdateDto {
  @IsUUID()
  @IsNotEmpty()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;
}

export class UpdateProductStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantStockUpdateDto)
  variantStocks?: VariantStockUpdateDto[];
}
