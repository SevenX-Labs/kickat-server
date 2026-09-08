import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum UploadTypeEnum {
  PRODUCT = 'product',
  CATEGORY = 'category',
  BLOG = 'blog',
  GENERAL = 'general',
}

export class UploadQueryDto {
  @ApiPropertyOptional({
    enum: UploadTypeEnum,
    example: 'product',
    description: 'Context of upload. Product images enforce 2MB–3MB. All other images enforce max 4MB.',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 2, description: 'Minimum file size in MB' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  minSizeMb?: number;

  @ApiPropertyOptional({ example: 3, description: 'Maximum file size in MB' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSizeMb?: number;
}

export class UploadOptionsDto {
  @ApiPropertyOptional({ example: 2, description: 'Minimum file size in MB' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  minSizeMb?: number;

  @ApiPropertyOptional({ example: 3, description: 'Maximum file size in MB' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSizeMb?: number;
}

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}
