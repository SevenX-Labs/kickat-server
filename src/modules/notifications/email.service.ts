import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendEmail(params: {
    recipient: string;
    subject: string;
    body: string;
    templateCode?: string;
    providerMessageId?: string;
  }) {
    this.logger.log(`[EMAIL DISPATCH] To: ${params.recipient} | Subject: ${params.subject}`);
    const providerMessageId =
      params.providerMessageId ||
      `msg_email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let status = 'SENT';
    let errorMessage: string | undefined = undefined;

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromAddress =
      this.configService.get<string>('RESEND_FROM') ||
      'Kickat <support@kickat.co.in>';

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f3f4f6; margin-bottom: 24px;">
          <a href="https://kickat.co.in" target="_blank" style="text-decoration: none;">
            <img src="https://kickat.co.in/logo-clean.png" alt="KickAt" width="140" style="max-width: 140px; height: auto; display: inline-block; vertical-align: middle;" />
          </a>
        </div>
        <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 700;">${params.subject}</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 16px 0;">${params.body}</p>
        <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 24px 0 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">© KickAt. Premium Pet Accessories. All rights reserved.</p>
      </div>
    `;

    if (!resendApiKey) {
      this.logger.error('[RESEND ERROR] RESEND_API_KEY is not configured in environment variables.');
      status = 'FAILED';
      errorMessage = 'RESEND_API_KEY is not configured';
    } else {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [params.recipient],
            subject: params.subject,
            text: params.body,
            html: htmlContent,
          }),
        });

        const resData: any = await response.json();
        if (response.ok && resData?.id) {
          this.logger.log(`[RESEND EMAIL SUCCESS] MessageId: ${resData.id} to ${params.recipient}`);
        } else {
          this.logger.error(`[RESEND EMAIL ERROR] Failed to send to ${params.recipient}:`, resData);
          status = 'FAILED';
          errorMessage = resData?.message || JSON.stringify(resData);
        }
      } catch (err: any) {
        this.logger.error(`[RESEND EMAIL ERROR] Exception sending to ${params.recipient}:`, err);
        status = 'FAILED';
        errorMessage = err instanceof Error ? err.message : 'Send error';
      }
    }

    try {
      await this.prisma.notificationLog.create({
        data: {
          channel: 'EMAIL',
          recipient: params.recipient,
          templateCode: params.templateCode,
          status,
          error: errorMessage,
          providerMessageId,
          retryCount: 0,
        },
      });
      return { success: status === 'SENT', providerMessageId, error: errorMessage };
    } catch (error) {
      this.logger.error('Failed to log email notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Send error' };
    }
  }
}
