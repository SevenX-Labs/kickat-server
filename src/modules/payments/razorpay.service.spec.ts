import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RazorpayService } from './razorpay.service';

describe('RazorpayService Strict Live-Only Implementation', () => {
  const createService = (configValues: Record<string, string | undefined>) => {
    const configService = new ConfigService(configValues);
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      return configValues[key];
    });
    return new RazorpayService(configService);
  };

  const realKeyId = 'rzp_live_TNDfAPblLUjqXr';
  const realKeySecret = 'cjGQzirdA14MR8f5NQp5PZnX';
  const realWebhookSecret = 'kickat2021';

  describe('Initialization & Credential Validation', () => {
    it('should initialize successfully with real live credentials', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
        RAZORPAY_WEBHOOK_SECRET: realWebhookSecret,
      });

      expect(service.getKeyId()).toBe(realKeyId);
    });

    it('should fail fast if RAZORPAY_KEY_ID is missing', () => {
      expect(() => {
        createService({
          RAZORPAY_KEY_SECRET: realKeySecret,
        });
      }).toThrow('Missing required Razorpay credentials');
    });

    it('should fail fast if RAZORPAY_KEY_SECRET is missing', () => {
      expect(() => {
        createService({
          RAZORPAY_KEY_ID: realKeyId,
        });
      }).toThrow('Missing required Razorpay credentials');
    });
  });

  describe('Payment Signature Verification', () => {
    it('should accept valid signature matching secret', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
      });

      const validSignature = crypto
        .createHmac('sha256', realKeySecret)
        .update('order_123|pay_123')
        .digest('hex');

      const res = service.verifySignature({
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_123',
        signature: validSignature,
      });

      expect(res).toBe(true);
    });

    it('should reject invalid or tampered signature', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
      });

      const res = service.verifySignature({
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_123',
        signature: 'invalid_signature_hash',
      });

      expect(res).toBe(false);
    });

    it('should reject mock signature strings', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
      });

      const res = service.verifySignature({
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_123',
        signature: 'mock_sig_123',
      });

      expect(res).toBe(false);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should accept valid webhook signature computed with webhook secret', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
        RAZORPAY_WEBHOOK_SECRET: realWebhookSecret,
      });

      const rawBody = JSON.stringify({ event: 'payment.captured' });
      const validWebhookSig = crypto
        .createHmac('sha256', realWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = service.verifyWebhookSignature({
        rawBody,
        signature: validWebhookSig,
      });

      expect(res).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
        RAZORPAY_WEBHOOK_SECRET: realWebhookSecret,
      });

      const res = service.verifyWebhookSignature({
        rawBody: '{"event":"payment.captured"}',
        signature: 'invalid_webhook_signature',
      });

      expect(res).toBe(false);
    });

    it('should reject mock webhook signature strings', () => {
      const service = createService({
        RAZORPAY_KEY_ID: realKeyId,
        RAZORPAY_KEY_SECRET: realKeySecret,
        RAZORPAY_WEBHOOK_SECRET: realWebhookSecret,
      });

      const res = service.verifyWebhookSignature({
        rawBody: '{"event":"payment.captured"}',
        signature: 'mock_wh_sig_123',
      });

      expect(res).toBe(false);
    });
  });
});
