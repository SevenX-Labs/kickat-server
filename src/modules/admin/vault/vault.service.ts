import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateVaultCredentialDto,
  UpdateVaultCredentialDto,
  VaultQueryDto,
} from "./dto/admin-vault.dto";

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List credentials with search, category filtering & pagination
   */
  async getCredentials(adminId: string, query: VaultQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 100));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search && query.search.trim() !== "") {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { usernameOrEmail: { contains: searchTerm, mode: "insensitive" } },
        { notes: { contains: searchTerm, mode: "insensitive" } },
        { url: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    if (query.category && query.category !== "ALL") {
      where.category = query.category;
    }

    const [items, total] = await Promise.all([
      this.prisma.adminVaultCredential.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.adminVaultCredential.count({ where }),
    ]);

    // Categories overview breakdown
    const allCategoryGroups = await this.prisma.adminVaultCredential.groupBy({
      by: ["category"],
      _count: { id: true },
    });

    const categories = allCategoryGroups.map((g) => ({
      name: g.category,
      count: g._count.id,
    }));

    return {
      success: true,
      data: {
        credentials: items,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
        summary: {
          totalCredentials: total,
          categories,
        },
      },
    };
  }

  /**
   * Get single credential by ID
   */
  async getCredentialById(adminId: string, id: string) {
    const credential = await this.prisma.adminVaultCredential.findUnique({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Credential with ID "${id}" not found`);
    }

    return {
      success: true,
      data: credential,
    };
  }

  /**
   * Create a new credential entry
   */
  async createCredential(adminId: string, dto: CreateVaultCredentialDto) {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException("Title is required");
    }
    if (!dto.usernameOrEmail || !dto.usernameOrEmail.trim()) {
      throw new BadRequestException("Username or Email is required");
    }
    if (!dto.password) {
      throw new BadRequestException("Password is required");
    }

    const created = await this.prisma.adminVaultCredential.create({
      data: {
        adminId,
        title: dto.title.trim(),
        usernameOrEmail: dto.usernameOrEmail.trim(),
        password: dto.password,
        url: dto.url?.trim() || null,
        notes: dto.notes?.trim() || null,
        category: dto.category?.trim() || "General",
      },
    });

    return {
      success: true,
      message: "Credential saved to vault successfully",
      data: created,
    };
  }

  /**
   * Update existing credential entry
   */
  async updateCredential(adminId: string, id: string, dto: UpdateVaultCredentialDto) {
    const existing = await this.prisma.adminVaultCredential.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Credential with ID "${id}" not found`);
    }

    const updated = await this.prisma.adminVaultCredential.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.usernameOrEmail !== undefined && {
          usernameOrEmail: dto.usernameOrEmail.trim(),
        }),
        ...(dto.password !== undefined && { password: dto.password }),
        ...(dto.url !== undefined && { url: dto.url ? dto.url.trim() : null }),
        ...(dto.notes !== undefined && { notes: dto.notes ? dto.notes.trim() : null }),
        ...(dto.category !== undefined && {
          category: dto.category ? dto.category.trim() : "General",
        }),
      },
    });

    return {
      success: true,
      message: "Credential updated successfully",
      data: updated,
    };
  }

  /**
   * Delete credential entry
   */
  async deleteCredential(adminId: string, id: string) {
    const existing = await this.prisma.adminVaultCredential.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Credential with ID "${id}" not found`);
    }

    await this.prisma.adminVaultCredential.delete({
      where: { id },
    });

    return {
      success: true,
      message: "Credential removed from vault successfully",
    };
  }
}
