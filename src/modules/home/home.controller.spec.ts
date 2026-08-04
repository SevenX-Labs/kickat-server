import { Test, TestingModule } from '@nestjs/testing';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

describe('HomeController', () => {
  let controller: HomeController;

  const mockHomeService = {
    getHomeData: jest.fn(),
    getBanners: jest.fn(),
    getCategories: jest.fn(),
    getCategoryTree: jest.fn(),
    getCategoryById: jest.fn(),
    getCategoryProducts: jest.fn(),
    getTrendingProducts: jest.fn(),
    getBestSellers: jest.fn(),
    getRecommendedProducts: jest.fn(),
    getBuyAgainProducts: jest.fn(),
    getBlogs: jest.fn(),
    getBlogCategories: jest.fn(),
    getBlogBySlug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [{ provide: HomeService, useValue: mockHomeService }],
    }).compile();

    controller = module.get<HomeController>(HomeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
