import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminCategoriesQueryDto,
  AdminCategorySortEnum,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/admin-category.dto';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to generate a URL-safe kebab-case slug
   */
  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Helper to ensure unique slug for category
   */
  private async ensureUniqueSlug(
    baseSlug: string,
    excludeCategoryId?: string,
  ): Promise<string> {
    let slug = this.generateSlug(baseSlug);
    let counter = 1;

    while (true) {
      const existing = await this.prisma.category.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || (excludeCategoryId && existing.id === excludeCategoryId)) {
        return slug;
      }

      slug = `${this.generateSlug(baseSlug)}-${counter}`;
      counter++;
    }
  }

  /**
   * GET /api/v1/admin/categories
   * List all categories (flat or tree) with filters and summary stats
   */
  async getCategories(query: AdminCategoriesQueryDto = {}) {
    if (query.tree) {
      return this.getCategoryTree();
    }

    const where: any = {
      deletedAt: null,
    };

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId;
    }

    if (query.isRoot) {
      where.parentId = null;
    }

    let orderBy: any = { order: 'asc' };
    switch (query.sort) {
      case AdminCategorySortEnum.ORDER_DESC:
        orderBy = { order: 'desc' };
        break;
      case AdminCategorySortEnum.NAME_ASC:
        orderBy = { name: 'asc' };
        break;
      case AdminCategorySortEnum.NAME_DESC:
        orderBy = { name: 'desc' };
        break;
      case AdminCategorySortEnum.CREATED_AT_DESC:
        orderBy = { createdAt: 'desc' };
        break;
      case AdminCategorySortEnum.CREATED_AT_ASC:
        orderBy = { createdAt: 'asc' };
        break;
      case AdminCategorySortEnum.ORDER_ASC:
      default:
        orderBy = { order: 'asc' };
        break;
    }

    const [categories, total, rootCount, subCount, activeCount, inactiveCount] =
      await Promise.all([
        this.prisma.category.findMany({
          where,
          orderBy,
          include: {
            parent: {
              select: { id: true, name: true, slug: true },
            },
            _count: {
              select: {
                products: { where: { deletedAt: null } },
                children: { where: { deletedAt: null } },
              },
            },
          },
        }),
        this.prisma.category.count({ where }),
        this.prisma.category.count({
          where: { deletedAt: null, parentId: null },
        }),
        this.prisma.category.count({
          where: { deletedAt: null, parentId: { not: null } },
        }),
        this.prisma.category.count({
          where: { deletedAt: null, isActive: true },
        }),
        this.prisma.category.count({
          where: { deletedAt: null, isActive: false },
        }),
      ]);

    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      imageUrl: cat.imageUrl,
      parentId: cat.parentId,
      parent: cat.parent,
      isActive: cat.isActive,
      order: cat.order,
      productsCount: cat._count.products,
      subcategoriesCount: cat._count.children,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));

    return {
      success: true,
      data: {
        categories: formatted,
        summary: {
          totalCategories: total,
          rootCategoriesCount: rootCount,
          subCategoriesCount: subCount,
          activeCount,
          inactiveCount,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/categories/tree
   * Get category tree hierarchy (root categories with nested children)
   */
  async getCategoryTree() {
    const categories = await this.prisma.category.findMany({
      where: {
        parentId: null,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            _count: {
              select: {
                products: { where: { deletedAt: null } },
              },
            },
          },
        },
        _count: {
          select: {
            products: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });

    const formattedTree = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      imageUrl: cat.imageUrl,
      isActive: cat.isActive,
      order: cat.order,
      productsCount: cat._count.products,
      subcategoriesCount: cat._count.children,
      children: cat.children.map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        imageUrl: child.imageUrl,
        parentId: child.parentId,
        isActive: child.isActive,
        order: child.order,
        productsCount: child._count.products,
        createdAt: child.createdAt,
        updatedAt: child.updatedAt,
      })),
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));

    return {
      success: true,
      data: {
        tree: formattedTree,
        totalRootCategories: categories.length,
      },
    };
  }

  /**
   * GET /api/v1/admin/categories/:id
   * Get single category details with parent, subcategories, and product metrics
   */
  async getCategoryById(idOrSlug: string) {
    const isUuid = UUID_V4_REGEX.test(idOrSlug);

    const category = await this.prisma.category.findFirst({
      where: {
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
        deletedAt: null,
      },
      include: {
        parent: true,
        children: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            _count: {
              select: {
                products: { where: { deletedAt: null } },
              },
            },
          },
        },
        _count: {
          select: {
            products: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        parentId: category.parentId,
        parent: category.parent,
        isActive: category.isActive,
        order: category.order,
        productsCount: category._count.products,
        subcategoriesCount: category._count.children,
        children: category.children.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          imageUrl: c.imageUrl,
          isActive: c.isActive,
          order: c.order,
          productsCount: c._count.products,
        })),
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    };
  }

  /**
   * POST /api/v1/admin/categories
   * Create category or subcategory
   */
  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Invalid parentId: Parent category not found');
      }
    }

    const slug = await this.ensureUniqueSlug(dto.slug || dto.name);

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        imageUrl: dto.imageUrl || null,
        parentId: dto.parentId || null,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
      },
      include: {
        parent: true,
      },
    });

    return {
      success: true,
      message: dto.parentId
        ? 'Subcategory created successfully'
        : 'Category created successfully',
      data: category,
    };
  }

  /**
   * PATCH /api/v1/admin/categories/:id
   * Edit category details (with circular hierarchy prevention)
   */
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Invalid parentId: Parent category not found');
      }

      // Prevent circular hierarchy (parent cannot be a descendant of this category)
      let currentParentId: string | null = parent.parentId;
      while (currentParentId) {
        if (currentParentId === id) {
          throw new BadRequestException(
            'Cannot set parentId: creates a circular category hierarchy',
          );
        }
        const ancestor = await this.prisma.category.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        currentParentId = ancestor?.parentId || null;
      }
    }

    let slug = existing.slug;
    if (dto.slug || (dto.name && dto.name !== existing.name && !dto.slug)) {
      slug = await this.ensureUniqueSlug(dto.slug || dto.name!, id);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(slug !== existing.slug && { slug }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      include: {
        parent: true,
      },
    });

    return {
      success: true,
      message: 'Category updated successfully',
      data: updated,
    };
  }

  /**
   * DELETE /api/v1/admin/categories/:id
   * Safe deletion with product dependency validation
   */
  async deleteCategory(id: string, permanent: boolean = false) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // 1. Check if any active products are associated with this category
    const productsCount = await this.prisma.product.count({
      where: {
        categoryId: id,
        deletedAt: null,
      },
    });

    if (productsCount > 0) {
      throw new BadRequestException(
        `Cannot delete category: ${productsCount} product(s) are currently assigned to this category. Please reassign or delete the products first.`,
      );
    }

    // 2. Check if any active subcategories exist under this category
    const childrenCount = await this.prisma.category.count({
      where: {
        parentId: id,
        deletedAt: null,
      },
    });

    if (childrenCount > 0) {
      throw new BadRequestException(
        `Cannot delete category: ${childrenCount} subcategory(ies) are attached to it. Please reassign or delete the subcategories first.`,
      );
    }

    // 3. Delete category
    if (permanent) {
      await this.prisma.category.delete({
        where: { id },
      });
    } else {
      await this.prisma.category.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    return {
      success: true,
      message: permanent
        ? 'Category permanently deleted'
        : 'Category soft-deleted successfully',
    };
  }

  /**
   * PATCH /api/v1/admin/categories/:id/status
   * Toggle or set active status
   */
  async updateStatus(id: string, dto: UpdateCategoryStatusDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: `Category ${dto.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updated,
    };
  }

  /**
   * PATCH /api/v1/admin/categories/reorder
   * Bulk update sort order across categories
   */
  async reorderCategories(dto: ReorderCategoriesDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.category.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }
    });

    return {
      success: true,
      message: 'Categories reordered successfully',
      data: {
        updatedCount: dto.items.length,
      },
    };
  }
}
