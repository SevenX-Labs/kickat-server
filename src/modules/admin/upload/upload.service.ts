import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MulterFile } from './dto/upload.dto';

export interface UploadedFileResponse {
  success: boolean;
  message: string;
  url: string;
  filename: string;
  size: number;
  sizeMb: string;
  mimetype: string;
  storageProvider: 'supabase' | 'local';
  bucket?: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private supabaseClient: SupabaseClient | null = null;
  private readonly bucketName: string;

  // Allowed file MIME types for images
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ];

  // Specific size policies
  // Product image: min 2 MB, max 3 MB
  public static readonly PRODUCT_MIN_SIZE_MB = 2;
  public static readonly PRODUCT_MAX_SIZE_MB = 3;

  // All other images (categories, blogs, avatars, etc.): min 0 MB, max 4 MB
  public static readonly DEFAULT_MIN_SIZE_MB = 0;
  public static readonly DEFAULT_MAX_SIZE_MB = 4;

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'upload';

    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ||
      'https://mspqduxvrypexahkkxjz.supabase.co';

    const supabaseKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY') ||
      this.configService.get<string>('SUPABASE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);
      this.logger.log(
        `Supabase Storage initialized for bucket '${this.bucketName}' at ${supabaseUrl}`,
      );
    } else {
      this.logger.warn(
        `Supabase credentials incomplete. Uploads will fall back to local storage.`,
      );
    }
  }

  /**
   * Determine min and max file size limits based on upload type or explicit overrides
   */
  resolveLimits(
    type?: string,
    minSizeMb?: number,
    maxSizeMb?: number,
  ): { minMb: number; maxMb: number; isProduct: boolean } {
    const isProduct = type?.trim().toLowerCase() === 'product';

    const defaultMin = isProduct
      ? UploadService.PRODUCT_MIN_SIZE_MB
      : UploadService.DEFAULT_MIN_SIZE_MB;
    const defaultMax = isProduct
      ? UploadService.PRODUCT_MAX_SIZE_MB
      : UploadService.DEFAULT_MAX_SIZE_MB;

    const minMb = minSizeMb !== undefined ? minSizeMb : defaultMin;
    const maxMb = maxSizeMb !== undefined ? maxSizeMb : defaultMax;

    return { minMb, maxMb, isProduct };
  }

  /**
   * Validate file size and mime type against size constraints:
   * - Product images: min 2MB, max 3MB
   * - All other images: max 4MB (no artificial min)
   */
  validateFile(
    file: MulterFile,
    minSizeMb?: number,
    maxSizeMb?: number,
    type?: string,
  ): void {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    // Check MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type '${file.mimetype}'. Only images (JPEG, PNG, WEBP, GIF, SVG) are allowed.`,
      );
    }

    const { minMb, maxMb, isProduct } = this.resolveLimits(type, minSizeMb, maxSizeMb);
    const minSizeBytes = minMb * 1024 * 1024;
    const maxSizeBytes = maxMb * 1024 * 1024;
    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);

    // Check minimum file size bound
    if (minMb > 0 && file.size < minSizeBytes) {
      const contextDesc = isProduct ? ' for product images' : '';
      throw new BadRequestException(
        `File size (${fileSizeMb} MB) is smaller than the minimum required limit of ${minMb} MB${contextDesc}. Please upload an image between ${minMb}MB and ${maxMb}MB.`,
      );
    }

    // Check maximum file size bound
    if (file.size > maxSizeBytes) {
      const contextDesc = isProduct ? ' for product images' : '';
      const rangeDesc = minMb > 0 ? `between ${minMb}MB and ${maxMb}MB` : `up to ${maxMb}MB`;
      throw new BadRequestException(
        `File size (${fileSizeMb} MB) exceeds the maximum allowed limit of ${maxMb} MB${contextDesc}. Please upload an image ${rangeDesc}.`,
      );
    }
  }

  /**
   * Single file upload logic targeting Supabase bucket 'upload' with local fallback
   */
  async uploadSingleFile(
    file: MulterFile,
    minSizeMb?: number,
    maxSizeMb?: number,
    type?: string,
  ): Promise<UploadedFileResponse> {
    this.validateFile(file, minSizeMb, maxSizeMb, type);

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanFileName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.[^/.]+$/, '');
    const folderPrefix = type ? `${type.toLowerCase()}/` : '';
    const fileName = `${folderPrefix}${Date.now()}-${cleanFileName}-${randomUUID().substring(0, 8)}${ext}`;
    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);

    // Attempt Supabase Storage Upload if client configured
    if (this.supabaseClient) {
      try {
        const { data, error } = await this.supabaseClient.storage
          .from(this.bucketName)
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (error) {
          this.logger.error(`Supabase upload error: ${error.message}`, error);
        } else if (data) {
          const { data: publicUrlData } = this.supabaseClient.storage
            .from(this.bucketName)
            .getPublicUrl(fileName);

          return {
            success: true,
            message: 'File uploaded successfully to Supabase Storage',
            url: publicUrlData.publicUrl,
            filename: fileName,
            size: file.size,
            sizeMb: `${fileSizeMb} MB`,
            mimetype: file.mimetype,
            storageProvider: 'supabase',
            bucket: this.bucketName,
          };
        }
      } catch (err) {
        this.logger.error(`Supabase upload failed, using local fallback`, err);
      }
    }

    // Fallback to local storage
    return this.saveFileLocally(file, fileName, fileSizeMb);
  }

  /**
   * Multiple file upload handler
   */
  async uploadMultipleFiles(
    files: MulterFile[],
    minSizeMb?: number,
    maxSizeMb?: number,
    type?: string,
  ): Promise<{ success: boolean; total: number; files: UploadedFileResponse[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }

    const uploadedResults: UploadedFileResponse[] = [];
    for (const file of files) {
      const result = await this.uploadSingleFile(file, minSizeMb, maxSizeMb, type);
      uploadedResults.push(result);
    }

    return {
      success: true,
      total: uploadedResults.length,
      files: uploadedResults,
    };
  }

  /**
   * Save file to local uploads directory as a failsafe fallback
   */
  private async saveFileLocally(
    file: MulterFile,
    fileName: string,
    fileSizeMb: string,
  ): Promise<UploadedFileResponse> {
    try {
      const uploadDir = path.resolve(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      await fs.promises.writeFile(filePath, file.buffer);

      const serverPort = this.configService.get<string>('PORT') || '3000';
      const fileUrl = `http://localhost:${serverPort}/uploads/${fileName}`;

      return {
        success: true,
        message: 'File uploaded successfully to local storage (Fallback)',
        url: fileUrl,
        filename: fileName,
        size: file.size,
        sizeMb: `${fileSizeMb} MB`,
        mimetype: file.mimetype,
        storageProvider: 'local',
      };
    } catch (err: any) {
      this.logger.error('Failed to save file locally', err);
      throw new InternalServerErrorException(
        `Failed to save uploaded file: ${err?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Get Current Upload Configuration & Limits:
   * - Product image: min 2MB, max 3MB
   * - All other images: max 4MB
   */
  getUploadConfig(type?: string) {
    const { minMb, maxMb, isProduct } = this.resolveLimits(type);
    return {
      success: true,
      config: {
        bucket: this.bucketName,
        current: {
          context: isProduct ? 'product' : (type || 'default'),
          minFileSizeMb: minMb,
          maxFileSizeMb: maxMb,
        },
        product: {
          minFileSizeMb: UploadService.PRODUCT_MIN_SIZE_MB,
          maxFileSizeMb: UploadService.PRODUCT_MAX_SIZE_MB,
          description: 'Product images must be between 2MB and 3MB',
        },
        allElse: {
          minFileSizeMb: UploadService.DEFAULT_MIN_SIZE_MB,
          maxFileSizeMb: UploadService.DEFAULT_MAX_SIZE_MB,
          description: 'All other images (categories, blogs, avatars, etc.) allow up to 4MB',
        },
        minFileSizeMb: minMb,
        maxFileSizeMb: maxMb,
        allowedMimeTypes: this.allowedMimeTypes,
        supabaseConnected: Boolean(this.supabaseClient),
      },
    };
  }
}
