import { NotificationsService } from "../notifications/notifications.service";
import { InvoicePdfService } from "../orders/invoice-pdf.service";
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';

describe('CheckoutService', () => {
  let service: CheckoutService;

  const mockPrismaService = {
    cartItem: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    address: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    stockReservation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    product: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockSettingsService = {
    getDeliverySettingsRaw: jest.fn().mockResolvedValue({
      deliveryFeeEnabled: true,
      deliveryFee: 49,
      freeDeliveryThreshold: 500,
    }),
    getPaymentSettingsRaw: jest.fn().mockResolvedValue({
      cod: { enabled: true, extraFee: 0 },
      upi: { enabled: true },
      card: { enabled: true },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: NotificationsService, useValue: { notifyOrderPlaced: jest.fn(), notifyPaymentSuccess: jest.fn(), notifyPaymentFailed: jest.fn(), notifyOrderStatusChange: jest.fn(), notifyReturnStatus: jest.fn(), notifyRefundStatus: jest.fn(), sendEventNotification: jest.fn() } },
        { provide: InvoicePdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from("pdf-data")) } },
        CheckoutService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
