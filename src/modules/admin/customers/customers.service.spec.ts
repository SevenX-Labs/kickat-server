import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { AdminCustomerSortEnum, AdminCustomersQueryDto } from './dto/admin-customer.dto';

describe('Admin CustomersService', () => {
  let service: CustomersService;
  let prisma: any;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    address: {
      findMany: jest.fn(),
    },
    pet: {
      findMany: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCustomers', () => {
    it('should return paginated customers with spend stats and summary counters', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          phone: '+919876543210',
          gender: 'FEMALE',
          dob: null,
          isProfileComplete: true,
          isEmailVerified: true,
          isPhoneVerified: false,
          isBlocked: false,
          createdAt: new Date('2026-08-01'),
          updatedAt: new Date('2026-08-01'),
          _count: { orders: 2, pets: 1, addresses: 1 },
          orders: [
            { grandTotal: 1500, createdAt: new Date('2026-08-10') },
            { grandTotal: 500, createdAt: new Date('2026-08-05') },
          ],
        },
      ];

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // active
        .mockResolvedValueOnce(0) // blocked
        .mockResolvedValueOnce(1); // verified

      const query: AdminCustomersQueryDto = {
        page: 1,
        limit: 10,
        search: 'Sarah',
        sort: AdminCustomerSortEnum.NAME_ASC,
      };

      const result = await service.getCustomers(query);

      expect(result.success).toBe(true);
      expect(result.data.customers.length).toBe(1);
      expect(result.data.customers[0].totalSpent).toBe(2000);
      expect(result.data.customers[0].ordersCount).toBe(2);
      expect(result.data.summary.totalCustomers).toBe(1);
      expect(result.data.summary.activeCustomersCount).toBe(1);
    });
  });

  describe('getCustomerById', () => {
    it('should return detailed profile with lifetime stats, addresses, and pets', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        phone: '+919876543210',
        gender: 'FEMALE',
        dob: null,
        isProfileComplete: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isBlocked: false,
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-01'),
        addresses: [{ id: 'addr-1', city: 'Mumbai', isDefault: true }],
        pets: [{ id: 'pet-1', name: 'Max', species: 'DOG' }],
        orders: [
          { grandTotal: 1500, createdAt: new Date('2026-08-10') },
          { grandTotal: 500, createdAt: new Date('2026-08-05') },
        ],
        _count: {
          orders: 2,
          pets: 1,
          addresses: 1,
          wishlistItems: 3,
          cartItems: 0,
        },
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getCustomerById('user-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('user-1');
      expect(result.data.stats.totalSpent).toBe(2000);
      expect(result.data.stats.averageOrderValue).toBe(1000);
      expect(result.data.stats.validOrdersCount).toBe(2);
      expect(result.data.addresses.length).toBe(1);
      expect(result.data.pets.length).toBe(1);
    });

    it('should throw NotFoundException if customer not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getCustomerById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCustomerOrders', () => {
    it('should return paginated order history for customer', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Sarah' });

      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-1001',
          orderStatus: 'DELIVERED',
          paymentStatus: 'COMPLETED',
          paymentMethod: 'UPI',
          subtotal: 900,
          deliveryFee: 50,
          grandTotal: 950,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [{ productName: 'Dog Chew', quantity: 2 }],
          payments: [],
          address: { city: 'Mumbai' },
        },
      ];

      prisma.order.findMany.mockResolvedValue(mockOrders);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.getCustomerOrders('user-1', { page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].orderNumber).toBe('ORD-1001');
      expect(result.data.orders[0].itemsCount).toBe(2);
    });

    it('should throw NotFoundException if customer does not exist when querying orders', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getCustomerOrders('invalid-id', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCustomerAddresses', () => {
    it('should return customer saved addresses', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.address.findMany.mockResolvedValue([
        { id: 'addr-1', city: 'Mumbai', isDefault: true },
      ]);

      const result = await service.getCustomerAddresses('user-1');

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(1);
      expect(result.data.addresses[0].city).toBe('Mumbai');
    });
  });

  describe('getCustomerPets', () => {
    it('should return customer pets', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.pet.findMany.mockResolvedValue([
        { id: 'pet-1', name: 'Buddy', species: 'DOG' },
      ]);

      const result = await service.getCustomerPets('user-1');

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(1);
      expect(result.data.pets[0].name).toBe('Buddy');
    });
  });

  describe('updateCustomerStatus', () => {
    it('should block customer and revoke active refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Bad Actor' });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        name: 'Bad Actor',
        isBlocked: true,
        updatedAt: new Date(),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.updateCustomerStatus('user-1', {
        isBlocked: true,
        reason: 'Fraudulent activity',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('blocked successfully');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });

    it('should unblock customer without revoking tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Reinstated User' });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        name: 'Reinstated User',
        isBlocked: false,
        updatedAt: new Date(),
      });

      const result = await service.updateCustomerStatus('user-1', {
        isBlocked: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('unblocked successfully');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
