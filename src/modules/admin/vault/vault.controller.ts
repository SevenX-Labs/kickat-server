import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { VaultService } from "./vault.service";
import { AdminAuth, CurrentUser } from "../../../common";
import { Admin } from "@prisma/client";
import {
  CreateVaultCredentialDto,
  UpdateVaultCredentialDto,
  VaultQueryDto,
} from "./dto/admin-vault.dto";

@AdminAuth()
@Controller("admin/vault")
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * GET /api/v1/admin/vault
   * List all stored credentials with search and category filtering
   */
  @Get()
  async getCredentials(
    @CurrentUser() admin: Admin,
    @Query() query: VaultQueryDto
  ) {
    return this.vaultService.getCredentials(admin.id, query);
  }

  /**
   * GET /api/v1/admin/vault/:id
   * Get single credential detail
   */
  @Get(":id")
  async getCredentialById(
    @CurrentUser() admin: Admin,
    @Param("id") id: string
  ) {
    return this.vaultService.getCredentialById(admin.id, id);
  }

  /**
   * POST /api/v1/admin/vault
   * Create a new vault credential
   */
  @Post()
  async createCredential(
    @CurrentUser() admin: Admin,
    @Body() dto: CreateVaultCredentialDto
  ) {
    return this.vaultService.createCredential(admin.id, dto);
  }

  /**
   * PATCH /api/v1/admin/vault/:id
   * Edit existing vault credential
   */
  @Patch(":id")
  async updateCredential(
    @CurrentUser() admin: Admin,
    @Param("id") id: string,
    @Body() dto: UpdateVaultCredentialDto
  ) {
    return this.vaultService.updateCredential(admin.id, id, dto);
  }

  /**
   * DELETE /api/v1/admin/vault/:id
   * Delete credential entry
   */
  @Delete(":id")
  async deleteCredential(
    @CurrentUser() admin: Admin,
    @Param("id") id: string
  ) {
    return this.vaultService.deleteCredential(admin.id, id);
  }
}
