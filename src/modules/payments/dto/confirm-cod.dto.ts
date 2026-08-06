import { IsUUID } from 'class-validator';

export class ConfirmCodDto {
  @IsUUID('4', { message: 'orderId must be a valid UUID v4' })
  orderId: string;
}
