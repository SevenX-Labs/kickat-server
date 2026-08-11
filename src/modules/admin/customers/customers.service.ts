import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminCustomerSortEnum,
  AdminCustomersQueryDto,
  CustomerOrdersQueryDto,
  UpdateCustomerStatusDto,
} from './dto/admin-customer.dto';
import { OrderStatusEnum } from '@prisma/client';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/admin/customers
   * Search, filter, sort, and paginate customers with lifetime spend and summary counters
   */
  async getCustomers(query: AdminCustomersQueryDto = {}) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (query.isBlocked !== undefined) {
      where.isBlocked = query.isBlocked;
    }

    if (query.isEmailVerified !== undefined) {
      where.isEmailVerified = query.isEmailVerified;
    }

    if (query.isPhoneVerified !== undefined) {
      where.isPhoneVerified = query.isPhoneVerified;
    }

    if (query.isProfileComplete !== undefined) {
      where.isProfileComplete = query.isProfileComplete;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    let orderBy: any = { createdAt: 'desc' };
    switch (query.sort) {
      case AdminCustomerSortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminCustomerSortEnum.NAME_ASC:
        orderBy = { name: 'asc' };
        break;
      case AdminCustomerSortEnum.NAME_DESC:
        orderBy = { name: 'desc' };
        break;
      case AdminCustomerSortEnum.CREATED_AT_DESC:
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [
      users,
      total,
      activeCount,
      blockedCount,
      verifiedCount,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          isProfileComplete: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          isBlocked: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              pets: true,
              addresses: true,
            },
          },
          orders: {
            where: { orderStatus: { not: OrderStatusEnum.CANCELLED } },
            select: { grandTotal: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, isBlocked: false } }),
      this.prisma.user.count({ where: { ...where, isBlocked: true } }),
      this.prisma.user.count({
        where: {
          ...where,
          OR: [{ isEmailVerified: true }, { isPhoneVerified: true }],
        },
      }),
    ]);

    const formattedCustomers = users.map((user) => {
      const totalSpent = user.orders.reduce((sum, o) => sum + o.grandTotal, 0);
      const lastOrderDate = user.orders[0]?.createdAt || null;

      return {
        id: user.id,
        name: user.name || 'Anonymous Customer',
        email: user.email || null,
        phone: user.phone || null,
        gender: user.gender,
        dob: user.dob,
        isProfileComplete: user.isProfileComplete,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        isBlocked: user.isBlocked,
        ordersCount: user._count.orders,
        petsCount: user._count.pets,
        addressesCount: user._count.addresses,
        totalSpent: Number(totalSpent.toFixed(2)),
        lastOrderDate,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        customers: formattedCustomers,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        summary: {
          totalCustomers: total,
          activeCustomersCount: activeCount,
          blockedCustomersCount: blockedCount,
          verifiedCustomersCount: verifiedCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/customers/:id
   * Complete customer profile with lifetime spending, addresses, pets, and recent orders
   */
  async getCustomerById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' },
        },
        pets: {
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          where: { orderStatus: { not: OrderStatusEnum.CANCELLED } },
          select: { grandTotal: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            orders: true,
            pets: true,
            addresses: true,
            wishlistItems: true,
            cartItems: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const totalSpent = user.orders.reduce((sum, o) => sum + o.grandTotal, 0);
    const validOrdersCount = user.orders.length;
    const averageOrderValue =
      validOrdersCount > 0 ? Number((totalSpent / validOrdersCount).toFixed(2)) : 0;
    const lastOrderDate = user.orders[0]?.createdAt || null;

    return {
      success: true,
      data: {
        id: user.id,
        name: user.name || 'Anonymous Customer',
        email: user.email || null,
        phone: user.phone || null,
        gender: user.gender,
        dob: user.dob,
        isProfileComplete: user.isProfileComplete,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        isBlocked: user.isBlocked,
        stats: {
          totalOrders: user._count.orders,
          validOrdersCount,
          totalSpent: Number(totalSpent.toFixed(2)),
          averageOrderValue,
          lastOrderDate,
          petsCount: user._count.pets,
          addressesCount: user._count.addresses,
          wishlistCount: user._count.wishlistItems,
          cartCount: user._count.cartItems,
        },
        addresses: user.addresses,
        pets: user.pets,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * GET /api/v1/admin/customers/:id/orders
   * Customer's complete paginated order history
   */
  async getCustomerOrders(id: string, query: CustomerOrdersQueryDto = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      userId: id,
      ...(query.status && { orderStatus: query.status }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: true,
          payments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          address: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const formatted = orders.map((order) => {
      const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const itemsSummary = order.items
        .map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity}`)
        .join(', ');

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        grandTotal: order.grandTotal,
        itemsCount,
        itemsSummary,
        items: order.items,
        shippingAddress: order.address,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        customer: user,
        orders: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/customers/:id/addresses
   * Customer's saved addresses
   */
  async getCustomerAddresses(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const addresses = await this.prisma.address.findMany({
      where: { userId: id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      data: {
        total: addresses.length,
        addresses,
      },
    };
  }

  /**
   * GET /api/v1/admin/customers/:id/pets
   * Customer's registered pets
   */
  async getCustomerPets(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const pets = await this.prisma.pet.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: {
        total: pets.length,
        pets,
      },
    };
  }

  /**
   * PATCH /api/v1/admin/customers/:id/status
   * Block or unblock customer (with instant session revocation on block)
   */
  async updateCustomerStatus(id: string, dto: UpdateCustomerStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Update isBlocked flag
      const updatedUser = await tx.user.update({
        where: { id },
        data: { isBlocked: dto.isBlocked },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isBlocked: true,
          updatedAt: true,
        },
      });

      // 2. If blocking, revoke all active refresh tokens immediately
      if (dto.isBlocked) {
        await tx.refreshToken.updateMany({
          where: { userId: id, isRevoked: false },
          data: { isRevoked: true },
        });
      }

      return updatedUser;
    });

    return {
      success: true,
      message: dto.isBlocked
        ? 'Customer blocked successfully and active sessions revoked'
        : 'Customer unblocked successfully',
      data: updated,
    };
  }
}
