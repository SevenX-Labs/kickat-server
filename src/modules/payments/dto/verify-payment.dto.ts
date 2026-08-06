import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class VerifyPaymentDto {
  @IsNotEmpty({ message: 'razorpayOrderId is required' })
  @IsString()
  razorpayOrderId: string;

  @IsNotEmpty({ message: 'razorpayPaymentId is required' })
  @IsString()
  razorpayPaymentId: string;

  @IsNotEmpty({ message: 'signature is required' })
  @IsString()
  signature: string;

  @IsUUID('4', { message: 'orderId must be a valid UUID v4' })
  orderId: string;
}
