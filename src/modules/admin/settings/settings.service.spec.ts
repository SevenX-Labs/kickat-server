import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
    it('should return all 4 setting groups', async () => {
      prisma.systemSetting.findUnique
        .mockResolvedValueOnce({
          key: 'general',
          value: {
            socialLinks: { instagram: 'https://instagram.com/kickat' },
            supportEmail: 'support@kickat.co.in',
            supportPhone: '+91 98765 43210',
            maintenanceMode: false,
          },
        })
        .mockResolvedValueOnce({
          key: 'payment',
          value: {
            cod: { enabled: true, extraFee: 40 },
            upi: { enabled: true },
            card: { enabled: true },
          },
        })
        .mockResolvedValueOnce({
          key: 'tax',
          value: {
            gstEnabled: true,
            gstNumber: '27AABCU9603R1ZM',
            gstPercentage: 18,
          },
        })
        .mockResolvedValueOnce({
          key: 'delivery',
          value: {
            deliveryFeeEnabled: true,
            deliveryFee: 50,
            freeDeliveryThreshold: 499,
          },
        });

      const result = await service.getAllSettings();

      expect(result.success).toBe(true);
      expect(result.data.general.supportEmail).toBe('support@kickat.co.in');
      expect(result.data.payment.cod.extraFee).toBe(40);
      expect(result.data.tax.gstPercentage).toBe(18);
      expect(result.data.delivery.deliveryFee).toBe(50);
      expect(result.data.general).not.toHaveProperty('siteName');
      expect(result.data.payment).not.toHaveProperty('razorpay');
    });
  });

  describe('General Settings', () => {
    it('should get and update general settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateGeneralSettings({
        socialLinks: { instagram: 'https://instagram.com/kickat' },
        supportEmail: 'care@kickat.co.in',
        supportPhone: '+91 99999 88888',
        maintenanceMode: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.supportEmail).toBe('care@kickat.co.in');
      expect(result.data.maintenanceMode).toBe(true);
      expect(result.data.socialLinks.instagram).toBe('https://instagram.com/kickat');
    });
  });

  describe('Payment Settings', () => {
    it('should get and update payment settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updatePaymentSettings({
        cod: { enabled: true, extraFee: 30 },
        upi: { enabled: true },
        card: { enabled: false },
      });

      expect(result.success).toBe(true);
      expect(result.data.cod.extraFee).toBe(30);
      expect(result.data.card.enabled).toBe(false);
      expect(result.data).not.toHaveProperty('razorpay');
    });
  });

  describe('Tax Settings', () => {
    it('should get and update tax settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateTaxSettings({
        gstEnabled: true,
        gstNumber: '27AABCU9603R1ZM',
        gstPercentage: 18,
      });

      expect(result.success).toBe(true);
      expect(result.data.gstEnabled).toBe(true);
      expect(result.data.gstPercentage).toBe(18);
    });
  });

  describe('Delivery Settings', () => {
    it('should get and update delivery settings', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateDeliverySettings({
        deliveryFeeEnabled: true,
        deliveryFee: 60,
        freeDeliveryThreshold: 599,
      });

      expect(result.success).toBe(true);
      expect(result.data.deliveryFeeEnabled).toBe(true);
      expect(result.data.deliveryFee).toBe(60);
      expect(result.data.freeDeliveryThreshold).toBe(599);
    });
  });

  describe('Public General Settings', () => {
    it('should return public customer settings payload', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        key: 'general',
        value: {
          socialLinks: { instagram: 'https://instagram.com/kickat' },
          supportEmail: 'support@kickat.co.in',
          supportPhone: '+91 98765 43210',
          maintenanceMode: false,
        },
      });

      const result = await service.getPublicGeneralSettings();

      expect(result.success).toBe(true);
      expect(result.data.general.supportEmail).toBe('support@kickat.co.in');
      expect(result.data.general.maintenanceMode).toBe(false);
      expect(result.data.delivery.deliveryFeeEnabled).toBeDefined();
      expect(result.data.tax.gstEnabled).toBeDefined();
    });
  });

  describe('Extra Fee Name Validation in Delivery Settings', () => {
    it('should PASS when extra fee is enabled with a valid name and trim whitespace', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateDeliverySettings({
        extraFeeEnabled: true,
        extraFeeName: ' Packaging Charge ',
        extraFeeAmount: 5,
        isExtraFeeCompulsory: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.extraFeeName).toBe('Packaging Charge');
      expect(result.data.extraFeeAmount).toBe(5);
    });

    it('should REJECT when extra fee is enabled with an empty string name', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateDeliverySettings({
          extraFeeEnabled: true,
          extraFeeName: '',
          extraFeeAmount: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT when extra fee is enabled with whitespace-only name', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateDeliverySettings({
          extraFeeEnabled: true,
          extraFeeName: '   ',
          extraFeeAmount: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT when extra fee is enabled without a name (null)', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateDeliverySettings({
          extraFeeEnabled: true,
          extraFeeName: null as any,
          extraFeeAmount: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should PASS when extra fee is disabled even with no name', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      prisma.systemSetting.upsert.mockImplementation(({ update }) =>
        Promise.resolve({ value: update.value }),
      );

      const result = await service.updateDeliverySettings({
        extraFeeEnabled: false,
        extraFeeName: '',
        extraFeeAmount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.extraFeeEnabled).toBe(false);
    });
  });
});
