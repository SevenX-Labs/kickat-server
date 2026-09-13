import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private razorpay: Razorpay | null = null;
  private keyId: string | null = null;
  private keySecret: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || null;
    this.keySecret =
      this.configService.get<string>('RAZORPAY_KEY_SECRET') || null;

    if (this.keyId && this.keySecret) {
      this.razorpay = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    } else {
      this.logger.warn(
        'Razorpay credentials missing. Operating in fallback mock mode for non-production environments.',
      );
    }
  }

  public isProduction(): boolean {
    const env = (this.configService.get<string>('NODE_ENV') || '').toLowerCase();
    const mode = (this.configService.get<string>('RAZORPAY_MODE') || '').toLowerCase();
    return env === 'production' || mode === 'production';
  }

  getKeyId(): string {
    return this.keyId || 'rzp_test_mock_key';
  }

  async createRazorpayOrder(params: {
    amountInPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; currency: string }> {
    if (this.isProduction() && !this.razorpay) {
      throw new BadRequestException(
        'Online payments are disabled. Missing Razorpay production credentials.',
      );
    }

    if (this.razorpay) {
      try {
        const order = await this.razorpay.orders.create({
          amount: Math.round(params.amountInPaise),
          currency: params.currency,
          receipt: params.receipt,
          notes: params.notes,
        });
        return {
          id: order.id,
          amount: Number(order.amount),
          currency: order.currency,
        };
      } catch (error) {
        this.logger.error('Failed to create Razorpay order:', error);
        throw error;
      }
    }

    // Fallback for development/testing when keys are not set
    const mockId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: mockId,
      amount: Math.round(params.amountInPaise),
      currency: params.currency,
    };
  }

  async createRefund(params: {
    paymentId: string;
    amountInPaise: number;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; status: string }> {
    if (this.isProduction() && !this.razorpay) {
      throw new BadRequestException(
        'Razorpay refund unavailable. Missing Razorpay production credentials.',
      );
    }

    if (this.razorpay) {
      try {
        const refund = await this.razorpay.payments.refund(params.paymentId, {
          amount: Math.round(params.amountInPaise),
          notes: params.notes,
        });
        return {
          id: refund.id,
          amount: Number(refund.amount),
          status: refund.status || 'processed',
        };
      } catch (error) {
        this.logger.error('Failed to create Razorpay refund:', error);
        throw error;
      }
    }

    // Development/test mock fallback
    const mockId = `rfnd_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: mockId,
      amount: Math.round(params.amountInPaise),
      status: 'processed',
    };
  }

  verifySignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean {
    const isProd = this.isProduction();

    if (isProd) {
      if (
        !params.signature ||
        params.signature.startsWith('mock_sig_') ||
        params.signature === `valid_sig_${params.razorpayOrderId}`
      ) {
        return false;
      }
      if (!this.keySecret) {
        return false;
      }
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
        .digest('hex');

      return generatedSignature === params.signature;
    }

    if (this.keySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
        .digest('hex');

      return generatedSignature === params.signature;
    }

    // Fallback mock check if keys are not set or for unit testing in dev
    if (params.signature.startsWith('mock_sig_')) {
      return true;
    }

    const dummySignature = crypto
      .createHmac('sha256', 'dummy_secret')
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest('hex');

    return (
      params.signature === dummySignature ||
      params.signature === `valid_sig_${params.razorpayOrderId}`
    );
  }

  verifyWebhookSignature(params: {
    rawBody: string | Buffer;
    signature: string;
    secret?: string;
  }): boolean {
    if (!params.signature) {
      return false;
    }

    const isProd = this.isProduction();
    if (isProd && params.signature.startsWith('mock_wh_sig_')) {
      return false;
    }

    if (!isProd && params.signature.startsWith('mock_wh_sig_')) {
      return true;
    }

    const webhookSecret =
      params.secret ||
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ||
      this.keySecret ||
      (isProd ? null : 'mock_webhook_secret');

    if (!webhookSecret) {
      return false;
    }

    const bodyBuffer = Buffer.isBuffer(params.rawBody)
      ? params.rawBody
      : Buffer.from(
          typeof params.rawBody === 'string'
            ? params.rawBody
            : JSON.stringify(params.rawBody || {}),
          'utf8',
        );

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyBuffer)
      .digest('hex');

    if (expectedSignature.length !== params.signature.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(params.signature, 'utf8'),
      );
    } catch {
      return false;
    }
  }
}
