import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '../../../common';
import { UploadService } from './upload.service';
import { MulterFile, UploadTypeEnum } from './dto/upload.dto';

@ApiTags('Admin Uploads')
@AdminAuth()
@Controller('admin/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * GET /api/v1/admin/upload/config
   * Returns allowed file types and size limits:
   * - Product images: min 2MB, max 3MB
   * - All other images: max 4MB
   */
  @Get('config')
  @ApiOperation({
    summary: 'Get upload constraints and size limits (Product: 2MB–3MB, All else: max 4MB)',
  })
  @ApiQuery({ name: 'type', required: false, enum: UploadTypeEnum })
  getUploadConfig(@Query('type') type?: string) {
    return this.uploadService.getUploadConfig(type);
  }

  /**
   * POST /api/v1/admin/upload
   * Single file upload endpoint with context-aware size validation:
   * - type=product: 2MB min, 3MB max
   * - else (default): max 4MB
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload single image file (Product: 2MB–3MB, All else: max 4MB)',
  })
  @ApiQuery({ name: 'type', required: false, enum: UploadTypeEnum })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadSingleFile(
    @UploadedFile() file: MulterFile,
    @Query('type') type?: string,
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(file, minSizeMb, maxSizeMb, type);
  }

  /**
   * POST /api/v1/admin/upload/product
   * Explicit convenience endpoint for product images (Enforces 2MB min, 3MB max)
   */
  @Post('product')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload single product image (Enforces 2MB min, 3MB max)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadProductFile(
    @UploadedFile() file: MulterFile,
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(file, minSizeMb, maxSizeMb, 'product');
  }

  /**
   * POST /api/v1/admin/upload/multiple
   * Multiple file upload endpoint (Max 10 files per request)
   */
  @Post('multiple')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload multiple images in batch (Product: 2MB–3MB, All else: max 4MB)',
  })
  @ApiQuery({ name: 'type', required: false, enum: UploadTypeEnum })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultipleFiles(
    @UploadedFiles() files: MulterFile[],
    @Query('type') type?: string,
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadMultipleFiles(files, minSizeMb, maxSizeMb, type);
  }

  /**
   * POST /api/v1/admin/upload/multiple/product
   * Explicit convenience endpoint for multiple product images (Enforces 2MB min, 3MB max per file)
   */
  @Post('multiple/product')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload multiple product images in batch (Enforces 2MB min, 3MB max per file)',
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultipleProductFiles(
    @UploadedFiles() files: MulterFile[],
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadMultipleFiles(files, minSizeMb, maxSizeMb, 'product');
  }
}
