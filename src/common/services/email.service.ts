import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const user =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER') ||
      this.configService.get<string>('EMAIL_USER');

    const pass =
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('GMAIL_PASS') ||
      this.configService.get<string>('EMAIL_PASS');

    const host =
      this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port =
      parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10);

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`[EMAIL SERVICE] Configured SMTP Transport using account: ${user}`);
    } else {
      this.logger.warn(
        `[EMAIL SERVICE] SMTP credentials missing (SMTP_USER / SMTP_PASS). Emails will be logged to console in dev mode.`,
      );
    }
  }

  /**
   * Send 6-digit Verification OTP via Email
   */
  async sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      '"Kickat E-Commerce" <noreply@kickat.com>';

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

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: toEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(`[EMAIL OTP SENT SUCCESS] Email dispatched to ${toEmail}`);
        return true;
      } catch (error) {
        this.logger.error(
          `[EMAIL OTP SEND ERROR] Failed to send email to ${toEmail}: ${error.message}`,
          error.stack,
        );
        // Do not crash, OTP was logged to console above
        return false;
      }
    }

    return true;
  }
}
