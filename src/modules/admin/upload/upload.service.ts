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

export type StorageNamespace = 'categories' | 'products' | 'blogs';

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
      this.configService.get<string>('SUPABASE_KEY') ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcHFkdXh2cnlwZXhhaGtreGp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTkzNjEzMiwiZXhwIjoyMTAxNTEyMTMyfQ.e9F0LhNIFfuWMsW9wH0idKDOD4yVKXJEFcjlBIBok4Y';

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

  /**
   * Normalize and resolve storage folder prefix (categories/, products/, blogs/)
   */
  resolveFolderPrefix(typeOrFolder?: string): string {
    if (!typeOrFolder) return 'categories/';
    const normalized = typeOrFolder.trim().toLowerCase();
    if (normalized === 'category' || normalized === 'categories')
      return 'categories/';
    if (normalized === 'product' || normalized === 'products')
      return 'products/';
    if (normalized === 'blog' || normalized === 'blogs') return 'blogs/';
    if (normalized === 'testimonial' || normalized === 'testimonials') return 'testimonials/';
    return 'categories/';
  }

  resolveLimits(
    type?: string,
    minSizeMb?: number,
    maxSizeMb?: number,
  ): { minMb: number; maxMb: number; isProduct: boolean } {
    const isProduct =
      type?.trim().toLowerCase() === 'product' ||
      type?.trim().toLowerCase() === 'products';

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

    const { minMb, maxMb, isProduct } = this.resolveLimits(
      type,
      minSizeMb,
      maxSizeMb,
    );
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
      const rangeDesc =
        minMb > 0 ? `between ${minMb}MB and ${maxMb}MB` : `up to ${maxMb}MB`;
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
    const folderPrefix = this.resolveFolderPrefix(type);
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
  ): Promise<{
    success: boolean;
    total: number;
    files: UploadedFileResponse[];
  }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }

    const uploadedResults: UploadedFileResponse[] = [];
    for (const file of files) {
      const result = await this.uploadSingleFile(
        file,
        minSizeMb,
        maxSizeMb,
        type,
      );
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to save file locally', err);
      throw new InternalServerErrorException(
        `Failed to save uploaded file: ${errMsg}`,
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
          context: isProduct ? 'product' : type || 'default',
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
          description:
            'All other images (categories, blogs, avatars, etc.) allow up to 4MB',
        },
        minFileSizeMb: minMb,
        maxFileSizeMb: maxMb,
        allowedMimeTypes: this.allowedMimeTypes,
        supabaseConnected: Boolean(this.supabaseClient),
      },
    };
  }

  /**
   * Parse storage path and provider from an image URL or path.
   * Handles:
   * 1. Supabase public URLs: .../storage/v1/object/public/<bucketName>/<filePath>
   * 2. Local uploads URLs: .../uploads/<filePath>
   * 3. Relative filePath if within upload folders
   */
  extractStoragePath(
    url: string,
  ): { provider: 'supabase' | 'local'; path: string; bucket?: string } | null {
    if (!url || typeof url !== 'string') return null;

    try {
      const cleanUrl = url.trim().split('?')[0].split('#')[0];

      // 1. Supabase URL format: /storage/v1/object/public/<bucket>/<path> OR /storage/v1/object/<bucket>/<path>
      const supabasePublicRegex =
        /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i;
      const supabasePublicMatch = cleanUrl.match(supabasePublicRegex);
      if (supabasePublicMatch) {
        return {
          provider: 'supabase',
          bucket: decodeURIComponent(supabasePublicMatch[1]),
          path: decodeURIComponent(supabasePublicMatch[2]),
        };
      }

      const supabaseDirectRegex = /\/storage\/v1\/object\/([^/]+)\/(.+)$/i;
      const supabaseDirectMatch = cleanUrl.match(supabaseDirectRegex);
      if (supabaseDirectMatch && supabaseDirectMatch[1] !== 'public') {
        return {
          provider: 'supabase',
          bucket: decodeURIComponent(supabaseDirectMatch[1]),
          path: decodeURIComponent(supabaseDirectMatch[2]),
        };
      }

      // 2. Local upload format: .../uploads/<path>
      const localRegex = /\/uploads\/(.+)$/i;
      const localMatch = cleanUrl.match(localRegex);
      if (localMatch) {
        return {
          provider: 'local',
          path: decodeURIComponent(localMatch[1]),
        };
      }

      // 3. Relative path format (e.g. "product/123.jpg" or "123.jpg")
      if (
        !cleanUrl.startsWith('http://') &&
        !cleanUrl.startsWith('https://') &&
        !cleanUrl.startsWith('data:')
      ) {
        const relativePath = cleanUrl.replace(/^\/+/, '');
        if (relativePath.length > 0) {
          return {
            provider: this.supabaseClient ? 'supabase' : 'local',
            bucket: this.bucketName,
            path: relativePath,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a single file from physical storage (Supabase or local disk) by its URL.
   */
  async deleteFileByUrl(url?: string | null): Promise<boolean> {
    if (!url) return false;

    const parsed = this.extractStoragePath(url);
    if (!parsed) {
      this.logger.debug(
        `Skipping file deletion: URL "${url}" is not a managed storage file`,
      );
      return false;
    }

    try {
      if (parsed.provider === 'supabase' && this.supabaseClient) {
        const bucket = parsed.bucket || this.bucketName;
        const { error } = await this.supabaseClient.storage
          .from(bucket)
          .remove([parsed.path]);

        if (error) {
          this.logger.warn(
            `Failed to delete Supabase file "${parsed.path}": ${error.message}`,
          );
          return false;
        }
        this.logger.log(
          `Deleted file from Supabase storage: bucket "${bucket}", path "${parsed.path}"`,
        );
        return true;
      }

      // Local fallback file deletion
      const uploadDir = path.resolve(process.cwd(), 'uploads');
      const localFilePath = path.resolve(uploadDir, parsed.path);

      // Prevent directory traversal
      if (!localFilePath.startsWith(uploadDir)) {
        this.logger.warn(
          `Security warning: Attempted path traversal in delete: ${parsed.path}`,
        );
        return false;
      }

      if (fs.existsSync(localFilePath)) {
        await fs.promises.unlink(localFilePath);
        this.logger.log(`Deleted file from local storage: ${localFilePath}`);
        return true;
      }

      return false;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error during file deletion for "${url}": ${errMsg}`);
      return false;
    }
  }

  /**
   * Batch delete multiple files from physical storage by their URLs.
   * Deduplicates URLs and batches Supabase removal calls for high performance.
   */
  async deleteFilesByUrls(
    urls: (string | null | undefined)[],
  ): Promise<number> {
    if (!urls || urls.length === 0) return 0;

    const validUrls = Array.from(
      new Set(
        urls.filter(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        ),
      ),
    );

    if (validUrls.length === 0) return 0;

    const supabaseBatches: Record<string, string[]> = {};
    const localPaths: string[] = [];

    for (const url of validUrls) {
      const parsed = this.extractStoragePath(url);
      if (!parsed) continue;

      if (parsed.provider === 'supabase' && this.supabaseClient) {
        const bucket = parsed.bucket || this.bucketName;
        if (!supabaseBatches[bucket]) {
          supabaseBatches[bucket] = [];
        }
        supabaseBatches[bucket].push(parsed.path);
      } else {
        localPaths.push(parsed.path);
      }
    }

    let deletedCount = 0;

    // 1. Delete from Supabase in bucket batches
    if (this.supabaseClient) {
      for (const [bucket, paths] of Object.entries(supabaseBatches)) {
        try {
          const { error } = await this.supabaseClient.storage
            .from(bucket)
            .remove(paths);

          if (error) {
            this.logger.warn(
              `Batch delete error in Supabase bucket "${bucket}": ${error.message}`,
            );
          } else {
            deletedCount += paths.length;
            this.logger.log(
              `Batch deleted ${paths.length} files from Supabase bucket "${bucket}"`,
            );
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Exception during Supabase batch removal: ${errMsg}`,
          );
        }
      }
    }

    // 2. Delete from local storage
    const uploadDir = path.resolve(process.cwd(), 'uploads');
    for (const relativePath of localPaths) {
      try {
        const localFilePath = path.resolve(uploadDir, relativePath);
        if (
          localFilePath.startsWith(uploadDir) &&
          fs.existsSync(localFilePath)
        ) {
          await fs.promises.unlink(localFilePath);
          deletedCount++;
          this.logger.log(`Deleted local file: ${localFilePath}`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to delete local file "${relativePath}": ${errMsg}`,
        );
      }
    }

    return deletedCount;
  }
  /**
   * Relocate an image file from general/temporary folder to its canonical entity namespace
   * (e.g. general/... -> categories/... or general/... -> products/...)
   */
  async relocateToNamespace(
    url?: string | null,
    targetNamespace: StorageNamespace = 'categories',
  ): Promise<string | null> {
    if (!url || typeof url !== 'string' || url.trim().length === 0) return null;

    const parsed = this.extractStoragePath(url);
    if (!parsed) {
      // External unmanaged URL (e.g. Unsplash), leave untouched
      return url;
    }

    const targetPrefix = `${targetNamespace}/`;
    if (parsed.path.startsWith(targetPrefix)) {
      // Already in correct namespace
      return url;
    }

    if (parsed.path.includes('..')) {
      this.logger.warn(
        `Security warning: Path traversal detected in relocateToNamespace: ${parsed.path}`,
      );
      return url;
    }

    const fileName = path.basename(parsed.path);
    const newPath = `${targetNamespace}/${fileName}`;

    // 1. Supabase Storage move
    if (parsed.provider === 'supabase' && this.supabaseClient) {
      const bucket = parsed.bucket || this.bucketName;
      try {
        const { error } = await this.supabaseClient.storage
          .from(bucket)
          .move(parsed.path, newPath);

        if (error) {
          this.logger.warn(
            `Failed to relocate Supabase file from "${parsed.path}" to "${newPath}": ${error.message}`,
          );
          return url;
        }

        const { data: publicUrlData } = this.supabaseClient.storage
          .from(bucket)
          .getPublicUrl(newPath);

        this.logger.log(
          `Relocated Supabase file: "${parsed.path}" -> "${newPath}"`,
        );
        return publicUrlData.publicUrl;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Exception during Supabase relocation: ${errMsg}`);
        return url;
      }
    }

    // 2. Local disk move
    try {
      const uploadDir = path.resolve(process.cwd(), 'uploads');
      const oldFilePath = path.resolve(uploadDir, parsed.path);
      const newFilePath = path.resolve(uploadDir, newPath);

      if (
        !oldFilePath.startsWith(uploadDir) ||
        !newFilePath.startsWith(uploadDir)
      ) {
        return url;
      }

      if (fs.existsSync(oldFilePath)) {
        const targetDir = path.dirname(newFilePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        await fs.promises.rename(oldFilePath, newFilePath);
        this.logger.log(
          `Relocated local file: "${oldFilePath}" -> "${newFilePath}"`,
        );

        const cleanUrl = url.trim().split('?')[0].split('#')[0];
        return cleanUrl.replace(/\/uploads\/.+$/i, `/uploads/${newPath}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Exception during local file relocation: ${errMsg}`);
    }

    return url;
  }

  /**
   * Batch relocate multiple image URLs to their canonical namespace
   */
  async relocateMultipleToNamespace(
    urls: (string | null | undefined)[],
    targetNamespace: StorageNamespace,
  ): Promise<string[]> {
    if (!urls || urls.length === 0) return [];
    const validUrls = urls.filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );
    const results = await Promise.all(
      validUrls.map((u) => this.relocateToNamespace(u, targetNamespace)),
    );
    return results.filter((u): u is string => typeof u === 'string');
  }
}
