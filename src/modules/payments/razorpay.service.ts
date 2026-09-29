import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService implements OnModuleInit {
  private readonly logger = new Logger(RazorpayService.name);
  private razorpay!: Razorpay;
  private keyId!: string;
  private keySecret!: string;

  constructor(private readonly configService: ConfigService) {
    this.initCredentials();
  }

  onModuleInit() {
    this.validateConfiguration();
  }

  private initCredentials() {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || '';
    this.keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

    this.validateConfiguration();

    this.razorpay = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  public validateConfiguration(): void {
    if (!this.keyId || !this.keySecret) {
      this.logger.error(
        'Missing required Razorpay credentials (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).',
      );
      throw new Error(
        'Missing required Razorpay credentials (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).',
      );
    }
  }

  getKeyId(): string {
    if (!this.keyId) {
      throw new BadRequestException('RAZORPAY_KEY_ID is not configured');
    }
    return this.keyId;
  }

  async createRazorpayOrder(params: {
    amountInPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; currency: string }> {
    if (!this.razorpay) {
      throw new BadRequestException('Razorpay client is not initialized.');
    }

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
    } catch (error: any) {
      const desc = error?.error?.description || error?.message || 'Failed to initialize payment gateway order';
      this.logger.error(`Failed to create Razorpay order: ${desc}`, error);
      if (error?.statusCode === 401 || desc.toLowerCase().includes('authentication failed')) {
        throw new BadRequestException('Payment gateway authentication failed. Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment.');
      }
      throw new BadRequestException(desc);
    }
  }

  async createRefund(params: {
    paymentId: string;
    amountInPaise: number;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; status: string }> {
    if (!this.razorpay) {
      throw new BadRequestException('Razorpay client is not initialized.');
    }

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

  verifySignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean {
    if (!params.signature || typeof params.signature !== 'string') {
      return false;
    }

    if (!this.keySecret) {
      return false;
    }

    const generatedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature.length !== params.signature.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(generatedSignature, 'utf8'),
        Buffer.from(params.signature, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  verifyWebhookSignature(params: {
    rawBody: string | Buffer;
    signature: string;
    secret?: string;
  }): boolean {
    if (!params.signature || typeof params.signature !== 'string') {
      return false;
    }

    const webhookSecret =
      params.secret ||
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ||
      null;

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
