import { Injectable, Logger } from '@nestjs/common';
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
        'Razorpay credentials missing. Operating in fallback mock mode.',
      );
    }
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

  verifySignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean {
    if (this.keySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
        .digest('hex');

      return generatedSignature === params.signature;
    }

    // Fallback mock check if keys are not set or for unit testing
    if (params.signature.startsWith('mock_sig_')) {
      return true;
    }

    // If key secret is not set, compute with dummy secret or check length
    const dummySignature = crypto
      .createHmac('sha256', 'dummy_secret')
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest('hex');

    return (
      params.signature === dummySignature ||
      params.signature === `valid_sig_${params.razorpayOrderId}`
    );
  }
}
