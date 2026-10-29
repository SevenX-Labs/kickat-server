import { StockAlertService } from '../notifications/stock-alert.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoicePdfService } from '../orders/invoice-pdf.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { ShippingService } from '../admin/shipping/shipping.service';
import { PaymentsService } from '../payments/payments.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CheckoutPaymentMethodEnum } from './dto/place-order.dto';

describe('CheckoutService - Phase 3 Safety Audit & Pre-Order Guard', () => {
  let service: CheckoutService;
  let prisma: any;
  let settingsService: any;
  let shippingService: any;
  let paymentsService: any;
  let mockProvider: any;

  const mockUserId = 'usr-1111-2222-3333-444444444444';
  const mockAddressId = 'addr-1111-2222-3333-444444444444';
  const mockIdempotencyKey = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  const mockAddress = {
    id: mockAddressId,
    userId: mockUserId,
    fullName: 'Sahil Hode',
    phone: '9876543210',
    houseFlat: 'Flat 101',
    buildingStreet: 'Main Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'India',
  };

  const mockCartItems = [
    {
      id: 'cart-1',
      userId: mockUserId,
      productId: 'prod-1',
      variantId: null,
      quantity: 1,
      product: {
        id: 'prod-1',
        name: 'Cat Scratch Post',
        price: 1000,
        discountPrice: 800,
        stock: 10,
        status: 'ACTIVE',
        deletedAt: null,
      },
      variant: null,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProvider = {
      providerName: 'DELHIVERY',
      checkServiceability: jest.fn().mockResolvedValue({
        isServiceable: true,
        codAvailable: true,
        prepaidAvailable: true,
      }),
    };

    shippingService = {
      getShippingProvider: jest.fn().mockReturnValue(mockProvider),
      calculateOrderWeight: jest.fn().mockResolvedValue(1.5),
      createShipmentForOrder: jest.fn().mockResolvedValue({ success: true }),
    };

    prisma = {
      cartItem: {
        findMany: jest.fn().mockResolvedValue(mockCartItems),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue(mockAddress),
        findMany: jest.fn().mockResolvedValue([mockAddress]),
      },
      stockReservation: {
        create: jest.fn().mockResolvedValue({
          id: 'res-1',
          userId: mockUserId,
          expiresAt: new Date(Date.now() + 600000),
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'res-1',
          userId: mockUserId,
          isFulfilled: false,
          expiresAt: new Date(Date.now() + 600000),
        }),
        update: jest.fn().mockResolvedValue({ id: 'res-1', isFulfilled: true }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ord-1',
          orderNumber: 'ORD-TEST-1',
          userId: mockUserId,
          grandTotal: 800,
          orderStatus: 'PLACED',
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'prod-1', stock: 10, name: 'Cat Scratch Post' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'var-1', stock: 10, name: 'Standard' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    settingsService = {
      getDeliverySettingsRaw: jest.fn().mockResolvedValue({
        deliveryFeeEnabled: true,
        deliveryFee: 50,
        freeDeliveryThreshold: 500,
      }),
      getPaymentSettingsRaw: jest.fn().mockResolvedValue({
        cod: { enabled: true, extraFee: 0 },
        upi: { enabled: true },
        card: { enabled: true },
      }),
      getTaxSettingsRaw: jest.fn().mockResolvedValue({
        gstEnabled: false,
        gstPercentage: 0,
      }),
    };

    paymentsService = {
      getGatewayKeyId: jest.fn().mockReturnValue('rzp_test_key'),
      createPaymentOrder: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        razorpayOrderId: 'order_rzp_1',
        amount: 800,
        currency: 'INR',
        status: 'PENDING',
        paymentMethod: 'upi',
        key: 'rzp_test_key',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settingsService },
        { provide: ShippingService, useValue: shippingService },
        { provide: PaymentsService, useValue: paymentsService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'SHIPPING_PROVIDER') return 'DELHIVERY';
              return defaultValue;
            }),
          },
        },
        { provide: StockAlertService, useValue: { evaluateStockChange: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
        { provide: InvoicePdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('pdf-data')) } },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  describe('1. validateAddress() - Live Serviceability & Free Delivery Threshold', () => {
    it('returns serviceable: false for invalid PIN formats (less than 6 digits, non-numeric, or starting with 0)', async () => {
      prisma.address.findFirst.mockResolvedValueOnce({ ...mockAddress, pincode: '012345' });
      const res1 = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res1.serviceable).toBe(false);
      expect(res1.message).toBe('Unserviceable pincode');

      prisma.address.findFirst.mockResolvedValueOnce({ ...mockAddress, pincode: '40061' });
      const res2 = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res2.serviceable).toBe(false);

      prisma.address.findFirst.mockResolvedValueOnce({ ...mockAddress, pincode: '40061a' });
      const res3 = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res3.serviceable).toBe(false);
    });

    it('returns serviceable: false when carrier serviceability reports PIN unserviceable', async () => {
      mockProvider.checkServiceability.mockResolvedValue({
        isServiceable: false,
        codAvailable: false,
        prepaidAvailable: false,
      });

      const res = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res.serviceable).toBe(false);
      expect(res.message).toBe('Delivery is currently unavailable for this pincode.');
    });

    it('calculates 0 delivery charge when cart subtotal meets freeDeliveryThreshold', async () => {
      // Subtotal is 800 (>= 500 threshold), deliveryFee should be 0
      const res = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res.serviceable).toBe(true);
      expect(res.deliveryCharge).toBe(0);
    });

    it('calculates full delivery charge when cart subtotal is below freeDeliveryThreshold', async () => {
      prisma.cartItem.findMany.mockResolvedValue([
        {
          id: 'cart-1',
          userId: mockUserId,
          productId: 'prod-1',
          variantId: null,
          quantity: 1,
          product: { id: 'prod-1', name: 'Item', price: 200, discountPrice: 200, stock: 10, status: 'ACTIVE', deletedAt: null },
          variant: null,
        },
      ]);

      const res = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res.serviceable).toBe(true);
      expect(res.deliveryCharge).toBe(50);
    });

    it('handles provider API failure gracefully without crashing', async () => {
      mockProvider.checkServiceability.mockRejectedValue(new Error('Delhivery connection timeout'));

      const res = await service.validateAddress(mockUserId, { addressId: mockAddressId });
      expect(res.serviceable).toBe(false);
      expect(res.message).toContain('Could not verify delivery serviceability');
    });
  });

  describe('2. getPaymentMethods() - PIN-Aware COD Eligibility', () => {
    it('returns COD available when destination PIN supports COD', async () => {
      mockProvider.checkServiceability.mockResolvedValue({
        isServiceable: true,
        codAvailable: true,
        prepaidAvailable: true,
      });

      const res = await service.getPaymentMethods(800, '400001');
      const cod = res.methods.find((m) => m.type === 'COD');
      expect(cod?.available).toBe(true);
      expect(cod?.reason).toBeUndefined();
    });

    it('disables COD with clear customer reason when destination PIN does not support COD', async () => {
      mockProvider.checkServiceability.mockResolvedValue({
        isServiceable: false,
        codAvailable: false,
        prepaidAvailable: true,
      });

      const res = await service.getPaymentMethods(800, '400001');
      const cod = res.methods.find((m) => m.type === 'COD');
      expect(cod?.available).toBe(false);
      expect(cod?.reason).toBe('Cash on Delivery is unavailable for this delivery pincode');

      // Prepaid methods remain available
      const upi = res.methods.find((m) => m.type === 'UPI');
      expect(upi?.available).toBe(true);
    });

    it('disables COD when provider serviceability check throws an error', async () => {
      mockProvider.checkServiceability.mockRejectedValue(new Error('Gateway timeout'));

      const res = await service.getPaymentMethods(800, '400001');
      const cod = res.methods.find((m) => m.type === 'COD');
      expect(cod?.available).toBe(false);
      expect(cod?.reason).toBe('Cash on Delivery is unavailable for this delivery pincode');
    });

    it('respects global COD disabled setting even if PIN is serviceable', async () => {
      settingsService.getPaymentSettingsRaw.mockResolvedValue({
        cod: { enabled: false, extraFee: 0 },
        upi: { enabled: true },
        card: { enabled: true },
      });

      const res = await service.getPaymentMethods(800, '400001');
      const cod = res.methods.find((m) => m.type === 'COD');
      expect(cod?.available).toBe(false);
      expect(cod?.reason).toBe('COD payment method is currently disabled');
    });
  });

  describe('3. placeOrder() - Pre-Order Guard Before Stock Deduction & Order Creation', () => {
    it('blocks order creation if shipping weight cannot be determined', async () => {
      shippingService.calculateOrderWeight.mockResolvedValue(null);

      await expect(
        service.placeOrder(mockUserId, mockIdempotencyKey, {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('blocks order creation if destination PIN is unserviceable', async () => {
      mockProvider.checkServiceability.mockResolvedValue({
        isServiceable: false,
        codAvailable: false,
        prepaidAvailable: false,
      });

      await expect(
        service.placeOrder(mockUserId, mockIdempotencyKey, {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.UPI,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('blocks COD order creation if COD is unavailable for destination PIN', async () => {
      mockProvider.checkServiceability.mockResolvedValue({
        isServiceable: false,
        codAvailable: false,
        prepaidAvailable: true,
      });

      await expect(
        service.placeOrder(mockUserId, mockIdempotencyKey, {
          addressId: mockAddressId,
          paymentMethod: CheckoutPaymentMethodEnum.COD,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('allows valid order creation when PIN and payment method are serviceable', async () => {
      const res = await service.placeOrder(mockUserId, mockIdempotencyKey, {
        addressId: mockAddressId,
        paymentMethod: CheckoutPaymentMethodEnum.COD,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe('ord-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
