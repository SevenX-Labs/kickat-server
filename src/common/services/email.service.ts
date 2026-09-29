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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333; text-align: center;">Kickat Account Verification</h2>
        <p style="font-size: 16px; color: #555;">Hello,</p>
        <p style="font-size: 16px; color: #555;">Use the following 6-digit Verification Code to verify your email address on Kickat:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4F46E5; background-color: #F3F4F6; padding: 12px 24px; border-radius: 6px; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 14px; color: #777;">This code is valid for <strong>10 minutes</strong>. Please do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">If you did not request this email, please ignore it.</p>
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
