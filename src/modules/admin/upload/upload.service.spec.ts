import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MulterFile } from './dto/upload.dto';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'SUPABASE_STORAGE_BUCKET') return 'upload';
      if (key === 'SUPABASE_URL') return null; // Force local or mock fallback
      return null;
    }),
  };

  const createMockFile = (sizeInMb: number, mimetype: string = 'image/png'): MulterFile => ({
    fieldname: 'file',
    originalname: 'test-image.png',
    encoding: '7bit',
    mimetype,
    size: Math.round(sizeInMb * 1024 * 1024),
    buffer: Buffer.alloc(10), // dummy buffer
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Product Image Size Limits (2MB min, 3MB max)', () => {
    it('should reject a product image smaller than 2MB', () => {
      const file = createMockFile(1.5);
      expect(() => service.validateFile(file, undefined, undefined, 'product')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateFile(file, undefined, undefined, 'product')).toThrow(
        /smaller than the minimum required limit of 2 MB for product images/,
      );
    });

    it('should accept a product image between 2MB and 3MB', () => {
      const file = createMockFile(2.5);
      expect(() => service.validateFile(file, undefined, undefined, 'product')).not.toThrow();
    });

    it('should reject a product image larger than 3MB', () => {
      const file = createMockFile(3.5);
      expect(() => service.validateFile(file, undefined, undefined, 'product')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateFile(file, undefined, undefined, 'product')).toThrow(
        /exceeds the maximum allowed limit of 3 MB for product images/,
      );
    });
  });

  describe('Default / Other Image Size Limits (max 4MB, no minimum)', () => {
    it('should accept a small image (e.g. 0.5MB) for general/category/blog', () => {
      const file = createMockFile(0.5);
      expect(() => service.validateFile(file, undefined, undefined, 'category')).not.toThrow();
      expect(() => service.validateFile(file, undefined, undefined, 'blog')).not.toThrow();
      expect(() => service.validateFile(file, undefined, undefined, undefined)).not.toThrow();
    });

    it('should accept an image up to 4MB for general/category/blog', () => {
      const file = createMockFile(3.8);
      expect(() => service.validateFile(file, undefined, undefined, 'category')).not.toThrow();
    });

    it('should reject an image larger than 4MB for general/category/blog', () => {
      const file = createMockFile(4.2);
      expect(() => service.validateFile(file, undefined, undefined, 'category')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateFile(file, undefined, undefined, 'category')).toThrow(
        /exceeds the maximum allowed limit of 4 MB/,
      );
    });
  });

  describe('Explicit Override of Size Limits', () => {
    it('should respect custom minSizeMb and maxSizeMb when provided', () => {
      const file = createMockFile(1.5);
      // Explicit override min: 1MB, max: 2MB
      expect(() => service.validateFile(file, 1, 2, 'product')).not.toThrow();
    });
  });

  describe('MIME Type Validation', () => {
    it('should reject non-image file types', () => {
      const pdfFile = createMockFile(2.5, 'application/pdf');
      expect(() => service.validateFile(pdfFile, undefined, undefined, 'product')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateFile(pdfFile, undefined, undefined, 'product')).toThrow(
        /Invalid file type/,
      );
    });
  });

  describe('getUploadConfig', () => {
    it('should return product limits when type is product', () => {
      const res = service.getUploadConfig('product');
      expect(res.success).toBe(true);
      expect(res.config.minFileSizeMb).toBe(2);
      expect(res.config.maxFileSizeMb).toBe(3);
      expect(res.config.product.minFileSizeMb).toBe(2);
      expect(res.config.product.maxFileSizeMb).toBe(3);
    });

    it('should return default limits when type is not product', () => {
      const res = service.getUploadConfig('category');
      expect(res.success).toBe(true);
      expect(res.config.minFileSizeMb).toBe(0);
      expect(res.config.maxFileSizeMb).toBe(4);
      expect(res.config.allElse.minFileSizeMb).toBe(0);
      expect(res.config.allElse.maxFileSizeMb).toBe(4);
    });
  });

  describe("File Deletion Methods", () => {
    it("should extract storage path from Supabase URL", () => {
      const url = "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/123-test.png";
      const parsed = service.extractStoragePath(url);
      expect(parsed).toEqual({
        provider: "supabase",
        bucket: "upload",
        path: "product/123-test.png",
      });
    });

    it("should extract storage path from local uploads URL", () => {
      const url = "http://localhost:3000/uploads/product/456-test.png";
      const parsed = service.extractStoragePath(url);
      expect(parsed).toEqual({
        provider: "local",
        path: "product/456-test.png",
      });
    });

    it("should return null for external unmanaged URLs", () => {
      const url = "https://images.unsplash.com/photo-123456";
      const parsed = service.extractStoragePath(url);
      expect(parsed).toBeNull();
    });

    it("should gracefully handle null or invalid URLs in deleteFileByUrl", async () => {
      expect(await service.deleteFileByUrl(null)).toBe(false);
      expect(await service.deleteFileByUrl("")).toBe(false);
      expect(await service.deleteFileByUrl("https://external.com/pic.jpg")).toBe(false);
    });

    it("should handle batch deletion with deleteFilesByUrls", async () => {
      const urls = [
        "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/test-1.png",
        "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/test-2.png",
        "https://external.com/pic.jpg", // ignored
        null,
      ];

      // In unit test environment without supabaseClient, these fall to local check
      const count = await service.deleteFilesByUrls(urls as any);
      expect(typeof count).toBe("number");
    });
  });
});
