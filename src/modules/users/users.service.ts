import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async addRecentlyViewed(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.recentlyViewed.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      create: { userId, productId },
      update: { createdAt: new Date() },
    });

    // Enforce maximum 20 items per user
    const userViews = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (userViews.length > 20) {
      const idsToDelete = userViews.slice(20).map((v) => v.id);
      await this.prisma.recentlyViewed.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return {
      success: true,
      message: 'Product added to recently viewed',
    };
  }

  async getRecentlyViewed(userId: string) {
    const views = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return {
      success: true,
      products: views.map((v) => v.product),
    };
  }
}
