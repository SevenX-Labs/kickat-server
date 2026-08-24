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
import { v4 as uuidv4 } from 'uuid';
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

  // Default file size constraints (2MB - 5MB)
  private readonly MIN_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
  private readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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
   * Validate file size and mime type against strict 2MB - 5MB requirements
   */
  validateFile(
    file: MulterFile,
    minSizeMb: number = 2,
    maxSizeMb: number = 5,
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

    const minSizeBytes = minSizeMb * 1024 * 1024;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    // Check file size bounds (2MB to 5MB limit)
    if (file.size < minSizeBytes) {
      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `File size (${fileSizeMb} MB) is smaller than the minimum required limit of ${minSizeMb} MB. Please upload an image between ${minSizeMb}MB and ${maxSizeMb}MB.`,
      );
    }

    if (file.size > maxSizeBytes) {
      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `File size (${fileSizeMb} MB) exceeds the maximum allowed limit of ${maxSizeMb} MB. Please upload an image between ${minSizeMb}MB and ${maxSizeMb}MB.`,
      );
    }
  }

  /**
   * Single file upload logic targeting Supabase bucket 'upload' with local fallback
   */
  async uploadSingleFile(
    file: MulterFile,
    minSizeMb: number = 2,
    maxSizeMb: number = 5,
  ): Promise<UploadedFileResponse> {
    this.validateFile(file, minSizeMb, maxSizeMb);

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanFileName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.[^/.]+$/, '');
    const fileName = `${Date.now()}-${cleanFileName}-${uuidv4().substring(0, 8)}${ext}`;
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
    minSizeMb: number = 2,
    maxSizeMb: number = 5,
  ): Promise<{ success: boolean; total: number; files: UploadedFileResponse[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }

    const uploadedResults: UploadedFileResponse[] = [];
    for (const file of files) {
      const result = await this.uploadSingleFile(file, minSizeMb, maxSizeMb);
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
   * Get Current Upload Configuration & Limits
   */
  getUploadConfig() {
    return {
      success: true,
      config: {
        bucket: this.bucketName,
        minFileSizeMb: 2,
        maxFileSizeMb: 5,
        allowedMimeTypes: this.allowedMimeTypes,
        supabaseConnected: Boolean(this.supabaseClient),
      },
    };
  }
}
