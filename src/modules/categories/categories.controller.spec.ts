import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;

  const mockCategoriesService = {
    getCategories: jest.fn(),
    getCategoryTree: jest.fn(),
    getCategoryById: jest.fn(),
    getCategoryProducts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCategories', () => {
    it('should call service getCategories', async () => {
      const expectedResult = { success: true, categories: [] };
      mockCategoriesService.getCategories.mockResolvedValue(expectedResult);

      const result = await controller.getCategories();

      expect(result).toBe(expectedResult);
      expect(mockCategoriesService.getCategories).toHaveBeenCalled();
    });
  });

  describe('getCategoryTree', () => {
    it('should call service getCategoryTree', async () => {
      const expectedResult = { success: true, categories: [] };
      mockCategoriesService.getCategoryTree.mockResolvedValue(expectedResult);

      const result = await controller.getCategoryTree();

      expect(result).toBe(expectedResult);
      expect(mockCategoriesService.getCategoryTree).toHaveBeenCalled();
    });
  });

  describe('getCategoryById', () => {
    it('should call service getCategoryById with params.id', async () => {
      const expectedResult = { success: true, category: { id: 'cat-1' } };
      mockCategoriesService.getCategoryById.mockResolvedValue(expectedResult);

      const result = await controller.getCategoryById({ id: 'cat-1' });

      expect(result).toBe(expectedResult);
      expect(mockCategoriesService.getCategoryById).toHaveBeenCalledWith('cat-1');
    });
  });

  describe('getCategoryProducts', () => {
    it('should call service getCategoryProducts with params.id and query', async () => {
      const expectedResult = { success: true, products: [], meta: {} };
      const query = { page: 1, limit: 10 };
      mockCategoriesService.getCategoryProducts.mockResolvedValue(expectedResult);

      const result = await controller.getCategoryProducts({ id: 'cat-1' }, query);

      expect(result).toBe(expectedResult);
      expect(mockCategoriesService.getCategoryProducts).toHaveBeenCalledWith('cat-1', query);
    });
  });
});
