import type { Request } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '../../../common';
import { UploadService, StorageNamespace } from './upload.service';
import {
  DeleteUploadedFilesDto,
  MulterFile,
  UploadTypeEnum,
} from './dto/upload.dto';

@ApiTags('Admin Uploads')
@AdminAuth()
@Controller('admin/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Intelligently determine target storage folder:
   * 1. Explicit folder or type query/body params
   * 2. Custom header x-upload-folder
   * 3. Browser Referer URL context (/categories, /products, /blogs)
   * 4. Default safe folder "general"
   */
  private determineContextFolder(
    req?: Request,
    folder?: string,
    bodyFolder?: string,
    type?: string,
    bodyType?: string,
  ): StorageNamespace {
    const headerFolder = req?.headers?.['x-upload-folder'];
    const headerStr = typeof headerFolder === 'string' ? headerFolder : '';
    const raw = (folder || bodyFolder || type || bodyType || headerStr)
      .trim()
      .toLowerCase();

    if (raw === 'product' || raw === 'products') return 'products';
    if (raw === 'blog' || raw === 'blogs') return 'blogs';
    if (raw === 'category' || raw === 'categories') return 'categories';

    const referer = req?.headers?.['referer'] || req?.headers?.['referrer'];
    if (referer && typeof referer === 'string') {
      const lower = referer.toLowerCase();
      if (lower.includes('/product')) return 'products';
      if (lower.includes('/blog')) return 'blogs';
      if (lower.includes('/categor')) return 'categories';
    }

    return 'categories';
  }

  /**
   * GET /api/v1/admin/upload/config
   * Returns allowed file types and size limits:
   * - Product images: min 2MB, max 3MB
   * - All other images: max 4MB
   */
  @Get('config')
  @ApiOperation({
    summary:
      'Get upload constraints and size limits (Product: 2MB–3MB, All else: max 4MB)',
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
    @Req() req?: Request,
    @Query('type') type?: string,
    @Query('folder') folder?: string,
    @Body('folder') bodyFolder?: string,
    @Body('type') bodyType?: string,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    const effectiveFolder = this.determineContextFolder(
      req,
      folder,
      bodyFolder,
      type,
      bodyType,
    );
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      effectiveFolder,
    );
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
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      'product',
    );
  }

  /**
   * POST /api/v1/admin/upload/multiple
   * Multiple file upload endpoint (Max 10 files per request)
   */

  /**
   * POST /api/v1/admin/upload/category
   * Explicit convenience endpoint for category images (Stores inside categories/ folder)
   */
  @Post('category')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload category image (Stored inside categories/ folder, max 4MB)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadCategoryFile(
    @UploadedFile() file: MulterFile,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      'categories',
    );
  }

  /**
   * POST /api/v1/admin/upload/categories (plural alias)
   */
  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload category image alias (Stored inside categories/ folder)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadCategoriesFile(
    @UploadedFile() file: MulterFile,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      'categories',
    );
  }

  /**
   * POST /api/v1/admin/upload/blog
   * Explicit convenience endpoint for blog images (Stored inside blogs/ folder)
   */
  @Post('blog')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload blog image (Stored inside blogs/ folder, max 4MB)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadBlogFile(
    @UploadedFile() file: MulterFile,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      'blogs',
    );
  }

  /**
   * POST /api/v1/admin/upload/blogs (plural alias)
   */
  @Post('blogs')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload blog image alias (Stored inside blogs/ folder)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadBlogsFile(
    @UploadedFile() file: MulterFile,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadSingleFile(
      file,
      minSizeMb,
      maxSizeMb,
      'blogs',
    );
  }

  @Post('multiple')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload multiple images in batch (Product: 2MB–3MB, All else: max 4MB)',
  })
  @ApiQuery({ name: 'type', required: false, enum: UploadTypeEnum })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultipleFiles(
    @UploadedFiles() files: MulterFile[],
    @Req() req?: Request,
    @Query('type') type?: string,
    @Query('folder') folder?: string,
    @Body('folder') bodyFolder?: string,
    @Body('type') bodyType?: string,
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    const effectiveFolder = this.determineContextFolder(
      req,
      folder,
      bodyFolder,
      type,
      bodyType,
    );
    return this.uploadService.uploadMultipleFiles(
      files,
      minSizeMb,
      maxSizeMb,
      effectiveFolder,
    );
  }

  /**
   * POST /api/v1/admin/upload/multiple/product
   * Explicit convenience endpoint for multiple product images (Enforces 2MB min, 3MB max per file)
   */
  @Post('multiple/product')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload multiple product images in batch (Enforces 2MB min, 3MB max per file)',
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultipleProductFiles(
    @UploadedFiles() files: MulterFile[],
    @Query('minSizeMb', new ParseIntPipe({ optional: true }))
    minSizeMb?: number,
    @Query('maxSizeMb', new ParseIntPipe({ optional: true }))
    maxSizeMb?: number,
  ) {
    return this.uploadService.uploadMultipleFiles(
      files,
      minSizeMb,
      maxSizeMb,
      'product',
    );
  }

  /**
   * DELETE /api/v1/admin/upload
   * Delete uploaded image file(s) from storage by URL
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete uploaded file(s) from storage by URL',
  })
  async deleteFile(
    @Query('url') queryUrl?: string,
    @Body() bodyDto?: DeleteUploadedFilesDto,
  ) {
    const urls: string[] = [];
    if (queryUrl) urls.push(queryUrl);
    if (bodyDto?.url) urls.push(bodyDto.url);
    if (bodyDto?.urls && Array.isArray(bodyDto.urls))
      urls.push(...bodyDto.urls);

    if (urls.length === 0) {
      return {
        success: true,
        message: 'No URLs provided for deletion',
        deletedCount: 0,
      };
    }

    const deletedCount = await this.uploadService.deleteFilesByUrls(urls);
    return {
      success: true,
      message: `Successfully deleted ${deletedCount} file(s) from storage`,
      deletedCount,
    };
  }

  /**
   * POST /api/v1/admin/upload/delete
   * Convenience POST endpoint for environments where DELETE with body is restricted
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete uploaded file(s) from storage by URL (POST alternative)',
  })
  async deleteFilePost(@Body() bodyDto: DeleteUploadedFilesDto) {
    return this.deleteFile(undefined, bodyDto);
  }
}
