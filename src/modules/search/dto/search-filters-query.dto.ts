import { IsOptional, IsUUID } from 'class-validator';

export class SearchFiltersQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid UUID v4' })
  categoryId?: string;
}
