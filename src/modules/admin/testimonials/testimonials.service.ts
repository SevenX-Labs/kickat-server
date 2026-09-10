import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  AdminTestimonialSortEnum,
  AdminTestimonialsQueryDto,
  CreateTestimonialDto,
  ReorderTestimonialsDto,
  ToggleTestimonialStatusDto,
  UpdateTestimonialDto,
} from "./dto/admin-testimonial.dto";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TestimonialsService {
  private readonly logger = new Logger(TestimonialsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, fieldName = "id"): string {
    if (!id || typeof id !== "string" || !UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID v4`);
    }
    return id;
  }

  /**
   * POST /api/v1/admin/testimonials
   * Create a new homepage testimonial
   */
  async create(dto: CreateTestimonialDto) {
    let displayOrder = dto.order;
    if (displayOrder === undefined || displayOrder === 0) {
      const maxOrder = await this.prisma.testimonial.aggregate({
        where: { deletedAt: null },
        _max: { order: true },
      });
      displayOrder = (maxOrder._max.order || 0) + 1;
    }

    const testimonial = await this.prisma.testimonial.create({
      data: {
        name: dto.name.trim(),
        role: dto.role ? dto.role.trim() : null,
        avatarUrl: dto.avatarUrl ? dto.avatarUrl.trim() : null,
        rating: dto.rating ?? 5,
        content: dto.content.trim(),
        petName: dto.petName ? dto.petName.trim() : null,
        petType: dto.petType ? dto.petType.trim() : null,
        imageUrl: dto.imageUrl ? dto.imageUrl.trim() : null,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        order: displayOrder,
      },
    });

    return {
      success: true,
      message: "Testimonial created successfully",
      data: testimonial,
    };
  }

  /**
   * GET /api/v1/admin/testimonials
   * List all testimonials with search, status filters, sorting, and KPI summary
   */
  async findAll(query: AdminTestimonialsQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }

    if (query.rating) {
      where.rating = query.rating;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { role: { contains: s, mode: "insensitive" } },
        { petName: { contains: s, mode: "insensitive" } },
        { content: { contains: s, mode: "insensitive" } },
      ];
    }

    let orderBy: any = [{ order: "asc" }, { createdAt: "desc" }];
    if (query.sort === AdminTestimonialSortEnum.ORDER_DESC) {
      orderBy = [{ order: "desc" }, { createdAt: "desc" }];
    } else if (query.sort === AdminTestimonialSortEnum.CREATED_AT_DESC) {
      orderBy = { createdAt: "desc" };
    } else if (query.sort === AdminTestimonialSortEnum.CREATED_AT_ASC) {
      orderBy = { createdAt: "asc" };
    } else if (query.sort === AdminTestimonialSortEnum.RATING_DESC) {
      orderBy = [{ rating: "desc" }, { order: "asc" }];
    } else if (query.sort === AdminTestimonialSortEnum.RATING_ASC) {
      orderBy = [{ rating: "asc" }, { order: "asc" }];
    }

    const [testimonials, total, activeCount, featuredCount, ratingAgg] =
      await Promise.all([
        this.prisma.testimonial.findMany({
          where,
          skip,
          take: limit,
          orderBy,
        }),
        this.prisma.testimonial.count({ where }),
        this.prisma.testimonial.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.testimonial.count({ where: { deletedAt: null, isFeatured: true } }),
        this.prisma.testimonial.aggregate({
          where: { deletedAt: null, isActive: true },
          _avg: { rating: true },
        }),
      ]);

    const avgRating = ratingAgg._avg.rating
      ? Number(ratingAgg._avg.rating.toFixed(2))
      : 5.0;

    return {
      success: true,
      data: {
        testimonials,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        summary: {
          totalTestimonials: total,
          activeCount,
          featuredCount,
          avgRating,
        },
      },
    };
  }

  /**
   * GET /api/v1/admin/testimonials/:id
   * Get single testimonial details
   */
  async findOne(id: string) {
    this.validateUuid(id);

    const testimonial = await this.prisma.testimonial.findFirst({
      where: { id, deletedAt: null },
    });

    if (!testimonial) {
      throw new NotFoundException("Testimonial not found");
    }

    return {
      success: true,
      data: testimonial,
    };
  }

  /**
   * PATCH /api/v1/admin/testimonials/:id
   * Edit testimonial details
   */
  async update(id: string, dto: UpdateTestimonialDto) {
    this.validateUuid(id);

    const existing = await this.prisma.testimonial.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException("Testimonial not found");
    }

    const updated = await this.prisma.testimonial.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.role !== undefined && { role: dto.role ? dto.role.trim() : null }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl ? dto.avatarUrl.trim() : null }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.content !== undefined && { content: dto.content.trim() }),
        ...(dto.petName !== undefined && { petName: dto.petName ? dto.petName.trim() : null }),
        ...(dto.petType !== undefined && { petType: dto.petType ? dto.petType.trim() : null }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl ? dto.imageUrl.trim() : null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });

    return {
      success: true,
      message: "Testimonial updated successfully",
      data: updated,
    };
  }

  /**
   * DELETE /api/v1/admin/testimonials/:id
   * Delete or soft-delete a testimonial
   */
  async remove(id: string, permanent = false) {
    this.validateUuid(id);

    const existing = await this.prisma.testimonial.findFirst({
      where: { id },
    });

    if (!existing || (!permanent && existing.deletedAt !== null)) {
      throw new NotFoundException("Testimonial not found");
    }

    if (permanent) {
      await this.prisma.testimonial.delete({ where: { id } });
    } else {
      await this.prisma.testimonial.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });
    }

    return {
      success: true,
      message: permanent
        ? "Testimonial permanently deleted"
        : "Testimonial removed successfully",
    };
  }

  /**
   * PATCH /api/v1/admin/testimonials/:id/status
   * Toggle active state (show/hide on homepage)
   */
  async toggleStatus(id: string, dto: ToggleTestimonialStatusDto) {
    this.validateUuid(id);

    const existing = await this.prisma.testimonial.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException("Testimonial not found");
    }

    const updated = await this.prisma.testimonial.update({
      where: { id },
      data: {
        isActive: dto.isActive,
      },
    });

    return {
      success: true,
      message: dto.isActive
        ? "Testimonial is now live on homepage"
        : "Testimonial hidden from homepage",
      data: updated,
    };
  }

  /**
   * PATCH /api/v1/admin/testimonials/reorder
   * Batch update display ordering of testimonials
   */
  async reorder(dto: ReorderTestimonialsDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.testimonial.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    return {
      success: true,
      message: "Testimonials reordered successfully",
    };
  }
}
