import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('Admin SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  const mockPrismaService = {
    systemSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllSettings', () => {
    it('should return all settings groups with masked secrets', async () => {
      prisma.systemSetting.findUnique
        .mockResolvedValueOnce({
          key: 'general',
          value: { siteName: 'Kickat Custom', smtp: { host: 'smtp.test.com', password: 'secretpassword123' } },
        })
        .mockResolvedValueOnce({ key: 'store', value: { storeName: 'Kickat Official' } })
        .mockResolvedValueOnce({
          key: 'payment',
          value: { razorpay: { keyId: 'rzp_123', keySecret: 'supersecretkey', webhookSecret: 'hooksecret' } },
        })
        .mockResolvedValueOnce(null) // tax default
        .mockResolvedValueOnce(null); // delivery default

      const result = await service.getAllSettings();

      expect(result.success).toBe(true);
      expect(result.data.general.siteName).toBe('Kickat Custom');
      expect(result.data.general.smtp.hasPassword).toBe(true);
      expect(result.data.general.smtp.password).toBe('••••••••');
      expect(result.data.general.smtp.password).not.toBe('secretpassword123');

      expect(result.data.payment.razorpay.hasSecretKey).toBe(true);
      expect(result.data.payment.razorpay.keySecret).toBe('••••••••');
      expect(result.data.payment.razorpay.keySecret).not.toBe('supersecretkey');
      expect(result.data.payment.razorpay.hasWebhookSecret).toBe(true);

      expect(result.data.tax.taxEnabled).toBe(true);
      expect(result.data.delivery.standardDeliveryFee).toBe(50);
    });
  });

  describe('General Settings', () => {
    it('should update general settings and preserve password if masked', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        key: 'general',
        value: { siteName: 'Old Name', smtp: { host: 'smtp.old.com', password: 'existingpassword' } },
      });
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateGeneralSettings({
        siteName: 'New Name',
        smtp: { host: 'smtp.new.com', password: '••••••••' },
      });

      expect(result.success).toBe(true);
      expect(result.data.siteName).toBe('New Name');
      expect(result.data.smtp.host).toBe('smtp.new.com');
      expect(result.data.smtp.hasPassword).toBe(true);
      expect(result.data.smtp.password).toBe('••••••••');

      // Verify the underlying save preserved existingpassword
      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            value: expect.objectContaining({
              siteName: 'New Name',
              smtp: expect.objectContaining({ password: 'existingpassword' }),
            }),
          }),
        }),
      );
    });
  });

  describe('Store Settings', () => {
    it('should get and update store settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const updated = await service.updateStoreSettings({
        storeName: 'Kickat Luxury Pets',
        currency: 'INR',
      });

      expect(updated.success).toBe(true);
      expect(updated.data.storeName).toBe('Kickat Luxury Pets');
      expect(updated.data.currency).toBe('INR');
    });
  });

  describe('Payment Settings', () => {
    it('should update payment settings and preserve secret if masked', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        key: 'payment',
        value: {
          razorpay: { enabled: true, keyId: 'rzp_old', keySecret: 'realSecretKey123' },
        },
      });
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updatePaymentSettings({
        razorpay: { keyId: 'rzp_new', keySecret: '••••••••' },
      });

      expect(result.success).toBe(true);
      expect(result.data.razorpay.keyId).toBe('rzp_new');
      expect(result.data.razorpay.hasSecretKey).toBe(true);
      expect(result.data.razorpay.keySecret).toBe('••••••••');

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            value: expect.objectContaining({
              razorpay: expect.objectContaining({
                keyId: 'rzp_new',
                keySecret: 'realSecretKey123',
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('Tax Settings', () => {
    it('should get and update tax settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateTaxSettings({
        standardGstRate: 18,
        cgstRate: 9,
        sgstRate: 9,
        gstNumber: '27XYZTEST1234',
      });

      expect(result.success).toBe(true);
      expect(result.data.standardGstRate).toBe(18);
      expect(result.data.gstNumber).toBe('27XYZTEST1234');
    });
  });

  describe('Delivery Settings', () => {
    it('should get and update delivery settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateDeliverySettings({
        standardDeliveryFee: 60,
        freeDeliveryThreshold: 599,
        defaultCourier: 'Shiprocket',
      });

      expect(result.success).toBe(true);
      expect(result.data.standardDeliveryFee).toBe(60);
      expect(result.data.freeDeliveryThreshold).toBe(599);
      expect(result.data.defaultCourier).toBe('Shiprocket');
    });
  });
});
