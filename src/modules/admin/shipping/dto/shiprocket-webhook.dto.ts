import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ShiprocketScanItemDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  sr_status?: string;

  @IsOptional()
  @IsString()
  sr_status_label?: string;
}

export class ShiprocketWebhookDto {
  @IsOptional()
  awb?: string;

  @IsOptional()
  awb_code?: string;

  @IsOptional()
  courier_name?: string;

  @IsOptional()
  courier_partner?: string;

  @IsOptional()
  current_status?: string;

  @IsOptional()
  shipment_status?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  current_status_id?: number | string;

  @IsOptional()
  shipment_status_id?: number | string;

  @IsOptional()
  status_code?: number | string;

  @IsOptional()
  order_id?: string | number;

  @IsOptional()
  sr_order_id?: string | number;

  @IsOptional()
  channel_order_id?: string | number;

  @IsOptional()
  shipment_id?: string | number;

  @IsOptional()
  sr_shipment_id?: string | number;

  @IsOptional()
  etd?: string;

  @IsOptional()
  edd?: string;

  @IsOptional()
  estimated_delivery_date?: string;

  @IsOptional()
  current_timestamp?: string;

  @IsOptional()
  event?: string;

  @IsOptional()
  event_id?: string | number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiprocketScanItemDto)
  scans?: ShiprocketScanItemDto[];

  @IsOptional()
  data?: any;

  @IsOptional()
  response?: any;

  [key: string]: any;
}
