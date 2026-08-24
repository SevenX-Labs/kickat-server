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
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '../../../common';
import { UploadService } from './upload.service';

@ApiTags('Admin Uploads')
@AdminAuth()
@Controller('admin/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * GET /api/v1/admin/upload/config
   * Returns allowed file types and size limits (2MB - 5MB)
   */
  @Get('config')
  getUploadConfig() {
    return this.uploadService.getUploadConfig();
  }

  /**
   * POST /api/v1/admin/upload
   * Single file upload endpoint with 2MB - 5MB size validation
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload single image file (Size constraint: 2MB to 5MB)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB memory limit, detailed 2MB-5MB validation handled in service
    }),
  )
  async uploadSingleFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb || 2,
      maxSizeMb || 5,
    );
  }

  /**
   * POST /api/v1/admin/upload/multiple
   * Multiple file upload endpoint (Max 10 files per request)
   */
  @Post('multiple')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload multiple image files (Size constraint: 2MB to 5MB per file)',
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('minSizeMb', new ParseIntPipe({ optional: true })) minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true })) maxSizeMb?: number,
  ) {
    return this.uploadService.uploadMultipleFiles(
      files,
      minSizeMb || 2,
      maxSizeMb || 5,
    );
  }
}
