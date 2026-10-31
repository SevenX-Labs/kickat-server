import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendOtpSmsResult {
  success: boolean;
  message?: string;
  transactionId?: string;
  errorCode?: string;
}

@Injectable()
export class OtpSmsService {
  private readonly logger = new Logger(OtpSmsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Dispatches a 6-digit OTP SMS via Nexus OTP Gateway (Fast2SMS integration).
   * API: POST https://apinexusotp.vercel.app/api/v1/otp/send
   */
  async sendOtpSms(phone: string, otp: string): Promise<SendOtpSmsResult> {
    const rawApiKey = (
      this.configService?.get<string>('OTP_API_KEY') ||
      this.configService?.get<string>('FAST2SMS_API_KEY') ||
      process.env.OTP_API_KEY ||
      process.env.FAST2SMS_API_KEY ||
      ''
    ).trim();

    // Strip optional surrounding quotes in env key
    const apiKey = rawApiKey.replace(/^["']|["']$/g, '').trim();

    // Clean phone number: retain only the last 10 digits
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length !== 10) {
      this.logger.warn(`[OTP SMS WARN] Invalid Indian phone number format: "${phone}"`);
      return {
        success: false,
        message: 'Invalid 10-digit phone number format',
      };
    }

    this.logger.log(`[MOBILE OTP DISPATCH] Dispatching OTP to: ${cleanPhone}`);

    if (!apiKey) {
      this.logger.warn(
        '[OTP SMS DEV] OTP_API_KEY is not configured in environment variables. OTP logged locally in development.',
      );
      return {
        success: true,
        message: 'OTP_API_KEY not configured; logged locally for development',
      };
    }

    const apiUrl = (
      this.configService?.get<string>('OTP_API_URL') ||
      process.env.OTP_API_URL ||
      'https://apinexusotp.vercel.app/api/v1/otp/send'
    ).trim();

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: cleanPhone,
          otp: String(otp),
        }),
        signal: AbortSignal.timeout(5000),
      });

      const resData: any = await response.json().catch(() => ({}));

      if (response.ok && resData?.success !== false) {
        const txnId = resData?.transaction_id || resData?.data?.id || 'TXN_OK';
        this.logger.log(
          `[OTP SMS SUCCESS] SMS dispatched to ${cleanPhone} | TxnId: ${txnId}`,
        );
        return {
          success: true,
          transactionId: txnId,
          message: resData?.message || 'OTP sent successfully',
        };
      }

      this.logger.warn(
        `[OTP SMS GATEWAY NOTICE] Gateway returned status=${response.status} for ${cleanPhone}: ${resData?.message || resData?.error_code || JSON.stringify(resData)}`,
      );

      return {
        success: false,
        errorCode: resData?.error_code,
        message: resData?.message || 'Gateway failed to send OTP',
        transactionId: resData?.transaction_id,
      };
    } catch (error: any) {
      this.logger.error(
        `[OTP SMS ERROR] Failed to dispatch OTP to ${cleanPhone}: ${error?.message || error}`,
        error?.stack,
      );
      return {
        success: false,
        message: error?.message || 'Network error while dispatching SMS OTP',
      };
    }
  }
}
