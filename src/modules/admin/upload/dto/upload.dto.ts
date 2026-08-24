import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UploadOptionsDto {
  @ApiPropertyOptional({ example: 2, description: 'Minimum file size in MB' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  minSizeMb?: number = 2;

  @ApiPropertyOptional({ example: 5, description: 'Maximum file size in MB' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSizeMb?: number = 5;
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

