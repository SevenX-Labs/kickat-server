import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';
import { ProfileService } from '../profile/profile.service';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { OrdersService } from '../orders/orders.service';
import { CheckoutService } from '../checkout/checkout.service';
import { PaymentsService } from '../payments/payments.service';
import { RazorpayService } from '../payments/razorpay.service';
import { ReviewsService } from '../reviews/reviews.service';
import { InAppService } from '../notifications/in-app.service';
import { SearchService } from '../search/search.service';
import { EmailService, OtpCacheService } from '../../common';

describe('Customer Authorization, IDOR, BOLA & Privilege Escalation Security Suite', () => {
  const userAId = '11111111-1111-4111-8111-111111111111';
  const userBId = '22222222-2222-4222-8222-222222222222';
  const adminId = '33333333-3333-4333-8333-333333333333';

  const orderAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orderBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const itemAId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const productAId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const addressAId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const addressBId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const petAId = '12121212-1212-4212-8212-121212121212';
  const petBId = '23232323-2323-4323-8323-232323232323';
  const returnAId = '34343434-3434-4344-8344-343434343434';
  const returnBId = '45454545-4545-4455-8455-454545454545';
  const paymentAId = '56565656-5656-4566-8566-565656565656';
  const paymentBId = '67676767-6767-4677-8677-676767676767';

  let prismaMock: any;
  let adminGuard: AdminGuard;
  let jwtStrategy: JwtStrategy;
  let profileService: ProfileService;
  let cartService: CartService;
  let wishlistService: WishlistService;
  let ordersService: OrdersService;
  let checkoutService: CheckoutService;
  let paymentsService: PaymentsService;
  let reviewsService: ReviewsService;
  let inAppService: InAppService;
  let searchService: SearchService;
  let usersService: UsersService;
  let authService: AuthService;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      admin: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      address: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      pet: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      cartItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      guestCartItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      wishlistItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      orderReturn: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productReview: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      reviewHelpful: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      recentSearch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      stockReservation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      otpLog: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { attempts: 0 } }),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
    };

    const mockEmailService = {
      sendOtpEmail: jest.fn().mockResolvedValue({ success: true }),
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockOtpCacheService = {
      isCooldownActive: jest.fn().mockReturnValue(false),
      setCooldown: jest.fn(),
      getOtpAttempts: jest.fn().mockReturnValue(0),
      incrementOtpAttempts: jest.fn().mockReturnValue(1),
      clearOtpAttempts: jest.fn(),
    };

    const mockRazorpayService = {
      getKeyId: jest.fn().mockReturnValue('rzp_test_key'),
      createRazorpayOrder: jest.fn().mockResolvedValue({ id: 'order_rzp_123' }),
      verifySignature: jest.fn().mockReturnValue(true),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        return 'test-secret';
      }),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn().mockReturnValue({ sub: userAId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        JwtAuthGuard,
        JwtStrategy,
        ProfileService,
        CartService,
        WishlistService,
        OrdersService,
        CheckoutService,
        PaymentsService,
        ReviewsService,
        InAppService,
        SearchService,
        UsersService,
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: mockEmailService },
        { provide: OtpCacheService, useValue: mockOtpCacheService },
        { provide: RazorpayService, useValue: mockRazorpayService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    adminGuard = module.get<AdminGuard>(AdminGuard);
    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    profileService = module.get<ProfileService>(ProfileService);
    cartService = module.get<CartService>(CartService);
    wishlistService = module.get<WishlistService>(WishlistService);
    ordersService = module.get<OrdersService>(OrdersService);
    checkoutService = module.get<CheckoutService>(CheckoutService);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    reviewsService = module.get<ReviewsService>(ReviewsService);
    inAppService = module.get<InAppService>(InAppService);
    searchService = module.get<SearchService>(SearchService);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
  });

  describe('1. Privilege Escalation Prevention & Guards', () => {
    it('AdminGuard must REJECT customer User token (lacking adminId)', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: userAId, email: 'customer@test.com', isBlocked: false },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => adminGuard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });

    it('AdminGuard must REJECT blocked or inactive admin account', () => {
      const mockBlockedContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: adminId, adminId: 'ADM-01', isActive: true, isBlocked: true },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => adminGuard.canActivate(mockBlockedContext)).toThrow(
        ForbiddenException,
      );

      const mockInactiveContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: adminId, adminId: 'ADM-01', isActive: false, isBlocked: false },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => adminGuard.canActivate(mockInactiveContext)).toThrow(
        ForbiddenException,
      );
    });

    it('AdminGuard must ALLOW valid, active, non-blocked admin', () => {
      const mockAdminContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: adminId, adminId: 'ADM-01', isActive: true, isBlocked: false },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(adminGuard.canActivate(mockAdminContext)).toBe(true);
    });

    it('JwtStrategy rejects blocked customer tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        isBlocked: true,
      });

      await expect(jwtStrategy.validate({ sub: userAId })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('2. Profile, Addresses & Pets IDOR / BOLA Prevention', () => {
    it('UserA cannot update UserB address (NotFoundException)', async () => {
      prismaMock.address.findFirst.mockResolvedValue(null);

      await expect(
        profileService.updateAddress(userAId, addressBId, { city: 'Hacked City' }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.address.findFirst).toHaveBeenCalledWith({
        where: { id: addressBId, userId: userAId },
      });
    });

    it('UserA cannot delete UserB address (NotFoundException)', async () => {
      prismaMock.address.findFirst.mockResolvedValue(null);

      await expect(
        profileService.deleteAddress(userAId, addressBId),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.address.findFirst).toHaveBeenCalledWith({
        where: { id: addressBId, userId: userAId },
      });
    });

    it('UserA cannot update UserB pet profile (NotFoundException)', async () => {
      prismaMock.pet.findFirst.mockResolvedValue(null);

      await expect(
        profileService.updatePet(userAId, petBId, { name: 'Hacked Pet' }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.pet.findFirst).toHaveBeenCalledWith({
        where: { id: petBId, userId: userAId },
      });
    });

    it('UserA cannot delete UserB pet profile (NotFoundException)', async () => {
      prismaMock.pet.findFirst.mockResolvedValue(null);

      await expect(
        profileService.deletePet(userAId, petBId),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.pet.findFirst).toHaveBeenCalledWith({
        where: { id: petBId, userId: userAId },
      });
    });

    it('UserA cannot change email to an already registered email of UserB', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        email: 'usera@example.com',
        isEmailVerified: false,
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        email: 'userb@example.com',
      });

      await expect(
        profileService.updateBasicProfile(userAId, {
          name: 'User A',
          email: 'userb@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('getProfile strictly scopes to requested userId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        name: 'User A',
        email: 'usera@example.com',
        addresses: [],
        pets: [],
      });

      const res = await profileService.getProfile(userAId);
      expect(res.user.id).toBe(userAId);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: userAId },
        include: expect.any(Object),
      });
    });
  });

  describe('3. Cart & Wishlist IDOR / BOLA Prevention', () => {
    it('UserA cannot update UserB cart item (NotFoundException)', async () => {
      prismaMock.cartItem.findFirst.mockResolvedValue(null);

      await expect(
        cartService.updateCartItem(userAId, 'cart-item-b', 5),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.cartItem.findFirst).toHaveBeenCalledWith({
        where: { id: 'cart-item-b', userId: userAId },
        include: { product: true, variant: true },
      });
    });

    it('UserA cannot remove UserB cart item (NotFoundException)', async () => {
      prismaMock.cartItem.findFirst.mockResolvedValue(null);

      await expect(
        cartService.removeCartItem(userAId, 'cart-item-b'),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.cartItem.findFirst).toHaveBeenCalledWith({
        where: { id: 'cart-item-b', userId: userAId },
      });
    });

    it('Wishlist moveToCart throws NotFoundException if product not in caller wishlist', async () => {
      prismaMock.wishlistItem.findFirst.mockResolvedValue(null);

      await expect(
        wishlistService.moveToCart(userAId, productAId, 1),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.wishlistItem.findFirst).toHaveBeenCalledWith({
        where: { userId: userAId, productId: productAId },
        include: { product: true, variant: true },
      });
    });

    it('Wishlist removeFromWishlist throws NotFoundException if product not in caller wishlist', async () => {
      prismaMock.wishlistItem.findFirst.mockResolvedValue(null);

      await expect(
        wishlistService.removeFromWishlist(userAId, productAId),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.wishlistItem.findFirst).toHaveBeenCalledWith({
        where: { userId: userAId, productId: productAId },
      });
    });
  });

  describe('4. Order IDOR / BOLA & State Boundary Prevention', () => {
    const mockOrderB = {
      id: orderBId,
      userId: userBId,
      orderNumber: 'ORD-999',
      orderStatus: OrderStatusEnum.DELIVERED,
      subtotal: 500,
      deliveryFee: 49,
      grandTotal: 549,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: itemAId,
          productId: productAId,
          quantity: 1,
        },
      ],
      address: {},
      payments: [],
      returns: [],
    };

    it('UserA cannot access UserB order details (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.getOrderById(userAId, orderBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot access UserB order timeline (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.getOrderTimeline(userAId, orderBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot access UserB order tracking (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.getOrderTracking(userAId, orderBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot access UserB order live tracking (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.getOrderTrackingLive(userAId, orderBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot download UserB order invoice (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.getOrderInvoice(userAId, orderBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot cancel UserB order (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.cancelOrder(userAId, orderBId, { reason: 'Changed mind' as any }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UserA cannot submit return for UserB order (ForbiddenException)', async () => {
      prismaMock.order.findUnique.mockResolvedValue(mockOrderB);

      await expect(
        ordersService.returnOrder(userAId, orderBId, {
          items: [{ orderItemId: itemAId, reason: 'Defective' as any }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returnOrder rejects return items not belonging to the order (BadRequestException)', async () => {
      const mockOrderA = {
        ...mockOrderB,
        userId: userAId,
        id: orderAId,
        items: [{ id: itemAId, productId: productAId }],
      };
      prismaMock.order.findUnique.mockResolvedValue(mockOrderA);

      await expect(
        ordersService.returnOrder(userAId, orderAId, {
          items: [{ orderItemId: 'foreign-item-id', reason: 'Defective' as any }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('UserA cannot view UserB return record (ForbiddenException)', async () => {
      prismaMock.orderReturn.findUnique.mockResolvedValue({
        id: returnBId,
        userId: userBId,
      });

      await expect(
        ordersService.getReturnById(userAId, returnBId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Checkout & Payment IDOR / BOLA Prevention', () => {
    it('validateAddress rejects address belonging to UserB (NotFoundException)', async () => {
      prismaMock.address.findFirst.mockResolvedValue(null);

      await expect(
        checkoutService.validateAddress(userAId, { addressId: addressBId }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.address.findFirst).toHaveBeenCalledWith({
        where: { id: addressBId, userId: userAId },
      });
    });

    it('placeOrder rejects address belonging to UserB (NotFoundException)', async () => {
      const idempotencyKey = '77777777-7777-4777-8777-777777777777';
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.stockReservation.findFirst.mockResolvedValue({
        id: 'res-1',
        userId: userAId,
      });
      prismaMock.cartItem.findMany.mockResolvedValue([
        { id: 'c1', productId: productAId, quantity: 1, product: { price: 100 } },
      ]);
      prismaMock.address.findFirst.mockResolvedValue(null);

      await expect(
        checkoutService.placeOrder(userAId, idempotencyKey, {
          addressId: addressBId,
          paymentMethod: 'UPI' as any,
          upiId: 'test@upi',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('placeOrder rejects idempotency key owned by UserB (ConflictException)', async () => {
      const idempotencyKey = '77777777-7777-4777-8777-777777777777';
      prismaMock.order.findUnique.mockResolvedValue({
        id: orderBId,
        userId: userBId,
      });

      await expect(
        checkoutService.placeOrder(userAId, idempotencyKey, {
          addressId: addressAId,
          paymentMethod: 'UPI' as any,
          upiId: 'test@upi',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('createPaymentOrder rejects order owned by UserB (NotFoundException)', async () => {
      const idempotencyKey = '88888888-8888-4888-8888-888888888888';
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        paymentsService.createPaymentOrder(userAId, idempotencyKey, {
          orderId: orderBId,
          paymentMethod: 'upi' as any,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: orderBId, userId: userAId },
      });
    });

    it('getPaymentById rejects payment owned by UserB (NotFoundException)', async () => {
      prismaMock.payment.findFirst.mockResolvedValue(null);

      await expect(
        paymentsService.getPaymentById(userAId, paymentBId),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.payment.findFirst).toHaveBeenCalledWith({
        where: { id: paymentBId, userId: userAId },
        include: expect.any(Object),
      });
    });

    it('confirmCod rejects order owned by UserB (NotFoundException)', async () => {
      const idempotencyKey = '99999999-9999-4999-8999-999999999999';
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        paymentsService.confirmCod(userAId, idempotencyKey, { orderId: orderBId }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: orderBId, userId: userAId },
      });
    });

    it('verifyPayment rejects order owned by UserB (NotFoundException)', async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        paymentsService.verifyPayment(userAId, {
          orderId: orderBId,
          razorpayOrderId: 'rzp_ord_1',
          razorpayPaymentId: 'rzp_pay_1',
          signature: 'sig_1',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: orderBId, userId: userAId },
      });
    });
  });

  describe('6. Reviews IDOR & Self-Helpful Protection', () => {
    it('createReview rejects review for order not belonging to caller (ForbiddenException)', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: productAId,
        reviewsCount: 1,
        rating: 4.5,
      });
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        reviewsService.createReview(userAId, {
          productId: productAId,
          orderId: orderBId,
          rating: 5,
          comment: 'Great product!',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: {
          id: orderBId,
          userId: userAId,
          orderStatus: OrderStatusEnum.DELIVERED,
          items: {
            some: {
              productId: productAId,
            },
          },
        },
      });
    });

    it('markHelpful prevents author from upvoting their own review (BadRequestException)', async () => {
      prismaMock.productReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        userId: userAId,
      });

      await expect(
        reviewsService.markHelpful(userAId, 'rev-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Notifications & Search History Scoping', () => {
    it('InAppService markAsRead strictly includes userId in update condition', async () => {
      await inAppService.markAsRead(userAId, 'notif-1');

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: userAId },
        data: { isRead: true },
      });
    });

    it('deleteRecentSearch throws NotFoundException when queryId belongs to UserB', async () => {
      prismaMock.recentSearch.findFirst.mockResolvedValue(null);

      await expect(
        searchService.deleteRecentSearch(userAId, 'search-b'),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.recentSearch.findFirst).toHaveBeenCalledWith({
        where: { id: 'search-b', userId: userAId },
      });
    });
  });

  describe('8. Account Hijacking / Verification Collision Prevention', () => {
    it('sendEmailVerification rejects email already registered to another user (BadRequestException)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        email: 'usera@example.com',
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        email: 'userb@example.com',
      });

      await expect(
        usersService.sendEmailVerification(userAId, { email: 'userb@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('verifyEmail rejects email already registered to another user (BadRequestException)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        email: 'usera@example.com',
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        email: 'userb@example.com',
      });

      await expect(
        usersService.verifyEmail(userAId, { email: 'userb@example.com', otp: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sendMobileVerification rejects phone already registered to another user (BadRequestException)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        phone: '+919000000001',
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        phone: '+919000000002',
      });

      await expect(
        usersService.sendMobileVerification(userAId, { phone: '+919000000002' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('verifyMobile rejects phone already registered to another user (BadRequestException)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userAId,
        phone: '+919000000001',
      });
      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        phone: '+919000000002',
      });

      await expect(
        usersService.verifyMobile(userAId, { phone: '+919000000002', otp: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('AuthService.verifyEmailOtp rejects linking email already registered to another user (BadRequestException)', async () => {
      const mockRes = { cookie: jest.fn() } as any;
      prismaMock.otpLog.findFirst.mockResolvedValue({
        id: 'otp-1',
        otpHash: '$2b$10$mockhash',
        expiresAt: new Date(Date.now() + 100000),
        attempts: 0,
      });
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true as never);

      prismaMock.user.findFirst.mockResolvedValue({
        id: userBId,
        email: 'userb@example.com',
      });

      await expect(
        authService.verifyEmailOtp(
          { email: 'userb@example.com', otp: '123456' },
          mockRes,
          { id: userAId },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
