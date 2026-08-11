import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatusEnum, PaymentStatusEnum } from '@prisma/client';

export enum AdminOrderSortEnum {
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  TOTAL_DESC = 'grandTotal_desc',
  TOTAL_ASC = 'grandTotal_asc',
}

export class AdminOrdersQueryDto {
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
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AdminOrderSortEnum)
  sort?: AdminOrderSortEnum = AdminOrderSortEnum.CREATED_AT_DESC;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusEnum)
  @IsNotEmpty()
  status: OrderStatusEnum;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  courierPartner?: string;

  @IsOptional()
  @IsDateString()
  estimatedDelivery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AdminCancelOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonOther?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  restockItems?: boolean = true;
}

export class AdminRefundOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  refundMethod?: string = 'ORIGINAL_PAYMENT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
