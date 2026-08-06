import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Auth, CurrentUser } from '../../common';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RetryPaymentDto } from './dto/retry-payment.dto';
import { ConfirmCodDto } from './dto/confirm-cod.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments/create-order
   */
  @Auth()
  @Post('create-order')
  @HttpCode(HttpStatus.OK)
  async createPaymentOrder(
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    return this.paymentsService.createPaymentOrder(
      userId,
      idempotencyKey,
      dto,
    );
  }

  /**
   * POST /payments/verify
   */
  @Auth()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(userId, dto);
  }

  /**
   * POST /payments/retry
   */
  @Auth()
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retryPayment(
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: RetryPaymentDto,
  ) {
    return this.paymentsService.retryPayment(userId, idempotencyKey, dto);
  }

  /**
   * GET /payments/:id
   */
  @Auth()
  @Get(':id')
  async getPaymentById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentsService.getPaymentById(userId, id);
  }

  /**
   * POST /payments/cod/confirm
   */
  @Auth()
  @Post('cod/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmCod(
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ConfirmCodDto,
  ) {
    return this.paymentsService.confirmCod(userId, idempotencyKey, dto);
  }

  /**
   * POST /payments/webhook (Public - Razorpay Callback)
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: any,
  ) {
    return this.paymentsService.handleWebhook(signature, body);
  }
}
