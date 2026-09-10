import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { TestimonialsService } from "./testimonials.service";
import { AdminAuth } from "../../../common";
import {
  AdminTestimonialsQueryDto,
  CreateTestimonialDto,
  ReorderTestimonialsDto,
  ToggleTestimonialStatusDto,
  UpdateTestimonialDto,
} from "./dto/admin-testimonial.dto";

@AdminAuth()
@Controller("admin/testimonials")
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  /**
   * POST /api/v1/admin/testimonials
   * Create a new homepage testimonial
   */
  @Post()
  async create(@Body() dto: CreateTestimonialDto) {
    return this.testimonialsService.create(dto);
  }

  /**
   * GET /api/v1/admin/testimonials
   * List all testimonials with search, status filters, and KPI summary
   */
  @Get()
  async findAll(@Query() query: AdminTestimonialsQueryDto) {
    return this.testimonialsService.findAll(query);
  }

  /**
   * PATCH /api/v1/admin/testimonials/reorder
   * Batch update testimonial display orders
   */
  @Patch("reorder")
  async reorder(@Body() dto: ReorderTestimonialsDto) {
    return this.testimonialsService.reorder(dto);
  }

  /**
   * GET /api/v1/admin/testimonials/:id
   * Get single testimonial details
   */
  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.testimonialsService.findOne(id);
  }

  /**
   * PATCH /api/v1/admin/testimonials/:id
   * Edit testimonial details
   */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTestimonialDto
  ) {
    return this.testimonialsService.update(id, dto);
  }

  /**
   * PUT /api/v1/admin/testimonials/:id
   * Alias for full/partial update
   */
  @Put(":id")
  async putUpdate(
    @Param("id") id: string,
    @Body() dto: UpdateTestimonialDto
  ) {
    return this.testimonialsService.update(id, dto);
  }

  /**
   * PATCH /api/v1/admin/testimonials/:id/status
   * Toggle active state (show/hide on homepage)
   */
  @Patch(":id/status")
  async toggleStatus(
    @Param("id") id: string,
    @Body() dto: ToggleTestimonialStatusDto
  ) {
    return this.testimonialsService.toggleStatus(id, dto);
  }

  /**
   * DELETE /api/v1/admin/testimonials/:id
   * Soft-delete or permanently delete testimonial
   */
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Query("permanent") permanent?: string
  ) {
    const isPermanent = permanent === "true";
    return this.testimonialsService.remove(id, isPermanent);
  }
}
