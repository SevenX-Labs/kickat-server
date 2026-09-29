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

    const htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">${params.subject}</h2>
      <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">${params.body}</p>
      <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
      <p style="color: #888888; font-size: 12px; text-align: center;">KickAt Notifications</p>
    </div>`;

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
