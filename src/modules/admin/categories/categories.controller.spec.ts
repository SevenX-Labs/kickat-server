import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import {
  AdminCategoriesQueryDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/admin-category.dto';

describe('Admin CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;

  const mockCategoriesService = {
    getCategories: jest.fn(),
    getCategoryTree: jest.fn(),
    getCategoryById: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    updateStatus: jest.fn(),
    reorderCategories: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getCategories should delegate to service', async () => {
    const expected = { success: true, data: { categories: [] } };
    mockCategoriesService.getCategories.mockResolvedValue(expected);

    const query: AdminCategoriesQueryDto = { search: 'Dog' };
    const result = await controller.getCategories(query);

    expect(result).toBe(expected);
    expect(mockCategoriesService.getCategories).toHaveBeenCalledWith(query);
  });

  it('getCategoryTree should delegate to service', async () => {
    const expected = { success: true, data: { tree: [] } };
    mockCategoriesService.getCategoryTree.mockResolvedValue(expected);

    const result = await controller.getCategoryTree();

    expect(result).toBe(expected);
    expect(mockCategoriesService.getCategoryTree).toHaveBeenCalled();
  });

  it('getCategoryById should delegate to service', async () => {
    const expected = { success: true, data: { id: 'cat-1' } };
    mockCategoriesService.getCategoryById.mockResolvedValue(expected);

    const result = await controller.getCategoryById('cat-1');

    expect(result).toBe(expected);
    expect(mockCategoriesService.getCategoryById).toHaveBeenCalledWith('cat-1');
  });

  it('createCategory should delegate to service', async () => {
    const expected = { success: true, data: { id: 'cat-1' } };
    mockCategoriesService.createCategory.mockResolvedValue(expected);

    const dto: CreateCategoryDto = { name: 'Dogs' };
    const result = await controller.createCategory(dto);

    expect(result).toBe(expected);
    expect(mockCategoriesService.createCategory).toHaveBeenCalledWith(dto);
  });

  it('updateCategory should delegate to service', async () => {
    const expected = { success: true, data: { id: 'cat-1' } };
    mockCategoriesService.updateCategory.mockResolvedValue(expected);

    const dto: UpdateCategoryDto = { name: 'Updated Dogs' };
    const result = await controller.updateCategory('cat-1', dto);

    expect(result).toBe(expected);
    expect(mockCategoriesService.updateCategory).toHaveBeenCalledWith('cat-1', dto);
  });

  it('deleteCategory should delegate to service', async () => {
    const expected = { success: true, message: 'Deleted' };
    mockCategoriesService.deleteCategory.mockResolvedValue(expected);

    const result = await controller.deleteCategory('cat-1', false);

    expect(result).toBe(expected);
    expect(mockCategoriesService.deleteCategory).toHaveBeenCalledWith('cat-1', false);
  });

  it('updateStatus should delegate to service', async () => {
    const expected = { success: true, data: { isActive: false } };
    mockCategoriesService.updateStatus.mockResolvedValue(expected);

    const dto: UpdateCategoryStatusDto = { isActive: false };
    const result = await controller.updateStatus('cat-1', dto);

    expect(result).toBe(expected);
    expect(mockCategoriesService.updateStatus).toHaveBeenCalledWith('cat-1', dto);
  });

  it('reorderCategories should delegate to service', async () => {
    const expected = { success: true, data: { updatedCount: 2 } };
    mockCategoriesService.reorderCategories.mockResolvedValue(expected);

    const dto: ReorderCategoriesDto = {
      items: [
        { id: 'cat-1', order: 1 },
        { id: 'cat-2', order: 2 },
      ],
    };
    const result = await controller.reorderCategories(dto);

    expect(result).toBe(expected);
    expect(mockCategoriesService.reorderCategories).toHaveBeenCalledWith(dto);
  });
});
