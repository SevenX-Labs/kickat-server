import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
      });
    }
  }

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
      this.configService.get<string>('SMTP_FROM') ||
      'Kickat <support@kickat.co.in>';

    const htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">${params.subject}</h2>
      <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">${params.body}</p>
      <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
      <p style="color: #888888; font-size: 12px; text-align: center;">Kickat Ecommerce Notifications</p>
    </div>`;

    if (resendApiKey) {
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
          this.logger.log(`[API EMAIL SUCCESS] MessageId: ${resData.id}`);
        } else {
          this.logger.error(`[API EMAIL ERROR] Failed to send to ${params.recipient}:`, resData);
          status = 'FAILED';
          errorMessage = resData?.message || JSON.stringify(resData);
        }
      } catch (err: any) {
        this.logger.error(`[API EMAIL ERROR] Exception sending to ${params.recipient}:`, err);
        status = 'FAILED';
        errorMessage = err instanceof Error ? err.message : 'Send error';
      }
    } else if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: params.recipient,
          subject: params.subject,
          text: params.body,
          html: htmlContent,
        });
        this.logger.log(`[SMTP SUCCESS] MessageId: ${info.messageId}`);
      } catch (err: any) {
        this.logger.error(`[SMTP ERROR] Failed to send email to ${params.recipient}:`, err);
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
