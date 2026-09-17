import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateVaultCredentialDto {
  @IsString({ message: "title must be a string" })
  @IsNotEmpty({ message: "title is required" })
  title: string;

  @IsString({ message: "usernameOrEmail must be a string" })
  @IsNotEmpty({ message: "usernameOrEmail is required" })
  usernameOrEmail: string;

  @IsString({ message: "password must be a string" })
  @IsNotEmpty({ message: "password is required" })
  password: string;

  @IsOptional()
  @IsString({ message: "url must be a string" })
  url?: string;

  @IsOptional()
  @IsString({ message: "notes must be a string" })
  notes?: string;

  @IsOptional()
  @IsString({ message: "category must be a string" })
  category?: string;
}

export class UpdateVaultCredentialDto {
  @IsOptional()
  @IsString({ message: "title must be a string" })
  title?: string;

  @IsOptional()
  @IsString({ message: "usernameOrEmail must be a string" })
  usernameOrEmail?: string;

  @IsOptional()
  @IsString({ message: "password must be a string" })
  password?: string;

  @IsOptional()
  @IsString({ message: "url must be a string" })
  url?: string;

  @IsOptional()
  @IsString({ message: "notes must be a string" })
  notes?: string;

  @IsOptional()
  @IsString({ message: "category must be a string" })
  category?: string;
}

export class VaultQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}
