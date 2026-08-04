import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PetSpeciesQueryEnum } from './category-products-query.dto';

export class ProductsBestSellersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(20, { message: 'limit cannot exceed 20' })
  limit?: number = 10;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID v4' })
  categoryId?: string;

  @IsOptional()
  @IsEnum(PetSpeciesQueryEnum, {
    message: 'petSpecies must be dog, cat, bird, fish, rabbit, or other',
  })
  petSpecies?: PetSpeciesQueryEnum;
}
