import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CampaignAudienceEnum,
  CampaignChannelEnum,
  CampaignStatusEnum,
} from '@prisma/client';

export enum AdminCampaignSortEnum {
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  SCHEDULED_AT_DESC = 'scheduledAt_desc',
  NAME_ASC = 'name_asc',
}

export class AdminCampaignsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(CampaignChannelEnum)
  channel?: CampaignChannelEnum;

  @IsOptional()
  @IsEnum(CampaignStatusEnum)
  status?: CampaignStatusEnum;

  @IsOptional()
  @IsEnum(CampaignAudienceEnum)
  audienceType?: CampaignAudienceEnum;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AdminCampaignSortEnum)
  sort?: AdminCampaignSortEnum = AdminCampaignSortEnum.CREATED_AT_DESC;
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(CampaignChannelEnum)
  channel: CampaignChannelEnum;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @IsOptional()
  @IsEnum(CampaignAudienceEnum)
  audienceType?: CampaignAudienceEnum = CampaignAudienceEnum.ALL_CUSTOMERS;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(CampaignChannelEnum)
  channel?: CampaignChannelEnum;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @IsOptional()
  @IsEnum(CampaignAudienceEnum)
  audienceType?: CampaignAudienceEnum;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
