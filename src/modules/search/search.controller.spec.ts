import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('SearchController', () => {
  let controller: SearchController;

  const mockSearchService = {
    search: jest.fn(),
    getSuggestions: jest.fn(),
    getRecentSearches: jest.fn(),
    deleteRecentSearch: jest.fn(),
    getTrendingSearches: jest.fn(),
    getFilters: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
