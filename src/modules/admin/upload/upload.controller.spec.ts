import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

describe('UploadController', () => {
  let controller: UploadController;
  let service: UploadService;

  const mockUploadService = {
    getUploadConfig: jest.fn(),
    uploadSingleFile: jest.fn(),
    uploadMultipleFiles: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: UploadService, useValue: mockUploadService },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
    service = module.get<UploadService>(UploadService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getUploadConfig with type', () => {
    controller.getUploadConfig('product');
    expect(service.getUploadConfig).toHaveBeenCalledWith('product');
  });

  it('should delegate uploadProductFile with product type', async () => {
    const mockFile: any = { originalname: 'product.png' };
    await controller.uploadProductFile(mockFile, undefined, undefined);
    expect(service.uploadSingleFile).toHaveBeenCalledWith(mockFile, undefined, undefined, 'product');
  });

  it('should delegate uploadMultipleProductFiles with product type', async () => {
    const mockFiles: any[] = [{ originalname: 'p1.png' }, { originalname: 'p2.png' }];
    await controller.uploadMultipleProductFiles(mockFiles, undefined, undefined);
    expect(service.uploadMultipleFiles).toHaveBeenCalledWith(mockFiles, undefined, undefined, 'product');
  });
});
