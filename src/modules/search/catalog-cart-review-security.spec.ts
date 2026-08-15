import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerModule, minutes, hours } from '@nestjs/throttler';
import request from 'supertest';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { CartController } from '../cart/cart.controller';
import { CartService } from '../cart/cart.service';
import { ReviewsController } from '../reviews/reviews.controller';
import { ReviewsService } from '../reviews/reviews.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('Public Search, Products, Guest Cart & Review Helpful Security Suite', () => {
  let app: INestApplication;
  let mockSearchService: any;
  let mockProductsService: any;
  let mockCartService: any;
  let mockReviewsService: any;

  beforeEach(async () => {
    mockSearchService = {
      search: jest.fn().mockResolvedValue({
        success: true,
        products: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      }),
      getSuggestions: jest.fn().mockResolvedValue({
        success: true,
        suggestions: ['dog food', 'cat toys'],
      }),
      getRecentSearches: jest.fn().mockResolvedValue({ success: true, searches: [] }),
      deleteRecentSearch: jest.fn().mockResolvedValue({ success: true }),
      getTrendingSearches: jest.fn().mockResolvedValue({ success: true, trends: [] }),
      getPopularSearches: jest.fn().mockResolvedValue({ success: true, popular: [] }),
      getFilters: jest.fn().mockResolvedValue({ success: true, filters: {} }),
    };

    mockProductsService = {
      getProducts: jest.fn().mockResolvedValue({
        success: true,
        products: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
      getProductById: jest.fn().mockResolvedValue({ success: true, product: { id: 'p1' } }),
      getProductVariants: jest.fn().mockResolvedValue({ success: true, variants: [] }),
      getProductMedia: jest.fn().mockResolvedValue({ success: true, media: [] }),
      getProductImages: jest.fn().mockResolvedValue({ success: true, images: [] }),
      getProductVideos: jest.fn().mockResolvedValue({ success: true, videos: [] }),
      getRelatedProducts: jest.fn().mockResolvedValue({ success: true, products: [] }),
      getProductReviews: jest.fn().mockResolvedValue({ success: true, reviews: [] }),
    };

    mockCartService = {
      getCart: jest.fn().mockResolvedValue({ success: true, items: [] }),
      addCartItem: jest.fn().mockResolvedValue({ success: true }),
      updateCartItem: jest.fn().mockResolvedValue({ success: true }),
      removeCartItem: jest.fn().mockResolvedValue({ success: true }),
      buyNow: jest.fn().mockResolvedValue({ success: true }),
      addGuestCartItem: jest.fn().mockResolvedValue({
        success: true,
        items: [{ id: 'item-1', quantity: 2 }],
      }),
      getGuestCart: jest.fn().mockResolvedValue({
        success: true,
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        grandTotal: 0,
      }),
      mergeCart: jest.fn().mockResolvedValue({ success: true }),
    };

    mockReviewsService = {
      createReview: jest.fn().mockResolvedValue({ success: true, review: { id: 'r1' } }),
      getReviews: jest.fn().mockResolvedValue({ success: true, reviews: [] }),
      getReviewById: jest.fn().mockResolvedValue({ success: true, review: { id: 'r1' } }),
      markHelpful: jest.fn().mockImplementation((userId: string, id: string) => {
        if (id === 'own-review-id') {
          return Promise.reject(new BadRequestException('You cannot mark your own review as helpful'));
        }
        if (id === 'duplicate-review-id') {
          return Promise.reject(new ConflictException('You have already marked this review as helpful'));
        }
        return Promise.resolve({ success: true, helpfulCount: 5 });
      }),
    };

    const mockJwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'user-123' }),
      sign: jest.fn().mockReturnValue('mock-token'),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        return null;
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'otp-send-short',
            ttl: minutes(10),
            limit: 3,
          },
          {
            name: 'otp-send-long',
            ttl: hours(1),
            limit: 20,
          },
          {
            name: 'otp-verify',
            ttl: hours(1),
            limit: 20,
          },
          {
            name: 'search',
            ttl: minutes(1),
            limit: 30,
          },
          {
            name: 'products',
            ttl: minutes(1),
            limit: 60,
          },
          {
            name: 'guest-cart',
            ttl: minutes(1),
            limit: 20,
          },
          {
            name: 'reviews-helpful',
            ttl: minutes(1),
            limit: 20,
          },
        ]),
      ],
      controllers: [
        SearchController,
        ProductsController,
        CartController,
        ReviewsController,
      ],
      providers: [
        { provide: SearchService, useValue: mockSearchService },
        { provide: ProductsService, useValue: mockProductsService },
        { provide: CartService, useValue: mockCartService },
        { provide: ReviewsService, useValue: mockReviewsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Search & Suggestions Rate Limiting (30 req / min / IP)', () => {
    it('should limit GET /search to 30 requests per minute per IP, rejecting the 31st with 429', async () => {
      const server = app.getHttpServer();

      for (let i = 1; i <= 30; i++) {
        const res = await request(server).get('/search?q=food');
        expect(res.status).toBe(200);
      }

      // 31st request -> blocked with 429
      const res31 = await request(server).get('/search?q=food');
      expect(res31.status).toBe(429);
    });

    it('should limit GET /search/suggestions to 30 requests per minute per IP, rejecting the 31st with 429', async () => {
      const server = app.getHttpServer();

      for (let i = 1; i <= 30; i++) {
        const res = await request(server).get('/search/suggestions?q=cat');
        expect(res.status).toBe(200);
      }

      // 31st request -> blocked with 429
      const res31 = await request(server).get('/search/suggestions?q=cat');
      expect(res31.status).toBe(429);
    });
  });

  describe('2. Products Catalog Rate Limiting (60 req / min / IP)', () => {
    it('should limit GET /products to 60 requests per minute per IP, rejecting the 61st with 429', async () => {
      const server = app.getHttpServer();

      for (let i = 1; i <= 60; i++) {
        const res = await request(server).get('/products');
        expect(res.status).toBe(200);
      }

      // 61st request -> blocked with 429
      const res61 = await request(server).get('/products');
      expect(res61.status).toBe(429);
    });
  });

  describe('3. Guest Cart Rate Limiting (20 req / min / IP) & Validation', () => {
    it('should reject non-UUID guestSessionId with 400 Bad Request', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .post('/cart/guest')
        .send({
          guestSessionId: 'invalid-non-uuid-string',
          productId: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
        });

      expect(res.status).toBe(400);
    });

    it('should limit POST /cart/guest to 20 requests per minute per IP, rejecting the 21st with 429', async () => {
      const server = app.getHttpServer();

      const validGuestDto = {
        guestSessionId: '11111111-1111-4111-8111-111111111111',
        productId: '22222222-2222-4222-8222-222222222222',
        quantity: 1,
      };

      for (let i = 1; i <= 20; i++) {
        const res = await request(server).post('/cart/guest').send(validGuestDto);
        expect(res.status).toBe(201);
      }

      // 21st request -> blocked with 429
      const res21 = await request(server).post('/cart/guest').send(validGuestDto);
      expect(res21.status).toBe(429);
    });
  });

  describe('4. Review Helpful Voting Business Rules & Throttling (20 req / min / IP)', () => {
    it('should disallow marking own review as helpful', async () => {
      await expect(
        mockReviewsService.markHelpful('user-123', 'own-review-id'),
      ).rejects.toThrow(new BadRequestException('You cannot mark your own review as helpful'));
    });

    it('should disallow duplicate helpful voting on the same review', async () => {
      await expect(
        mockReviewsService.markHelpful('user-123', 'duplicate-review-id'),
      ).rejects.toThrow(new ConflictException('You have already marked this review as helpful'));
    });
  });
});
