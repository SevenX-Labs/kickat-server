import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send 6-digit Verification OTP via Resend Email API
   */
  async sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('RESEND_FROM') ||
      'Kickat <support@kickat.co.in>';

    const subject = 'Your Kickat Verification Code';
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f3f4f6; margin-bottom: 24px;">
          <a href="https://kickat.co.in" target="_blank" style="text-decoration: none;">
            <img src="https://kickat.co.in/logo-clean.png" alt="KickAt" width="140" style="max-width: 140px; height: auto; display: inline-block; vertical-align: middle;" />
          </a>
        </div>
        <h2 style="color: #111827; text-align: center; font-size: 20px; font-weight: 700; margin-top: 0;">Kickat Account Verification</h2>
        <p style="font-size: 15px; color: #374151; margin: 16px 0;">Hello,</p>
        <p style="font-size: 15px; color: #374151; margin: 16px 0;">Use the following 6-digit Verification Code to verify your email address on Kickat:</p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #ff5b29; background-color: #fff7ed; padding: 14px 28px; border-radius: 8px; border: 1px solid #ffedd5; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">This code is valid for <strong>10 minutes</strong>. Please do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0 16px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">If you did not request this email, please ignore it.</p>
      </div>
    `;

    this.logger.log(`[EMAIL OTP GENERATED] To: ${toEmail} | OTP: ${otp}`);

    if (!resendApiKey) {
      this.logger.error('[RESEND OTP ERROR] RESEND_API_KEY is missing in environment variables.');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [toEmail],
          subject,
          text: `Your Kickat verification code is ${otp}. It expires in 10 minutes.`,
          html: htmlContent,
        }),
      });

      const resData: any = await response.json();
      if (response.ok && resData?.id) {
        this.logger.log(`[RESEND OTP SUCCESS] MessageId: ${resData.id} to ${toEmail}`);
        return true;
      } else {
        this.logger.error(`[RESEND OTP ERROR] Failed to send OTP to ${toEmail}:`, resData);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`[RESEND OTP EXCEPTION] Failed sending to ${toEmail}:`, error);
      return false;
    }
  }
}
