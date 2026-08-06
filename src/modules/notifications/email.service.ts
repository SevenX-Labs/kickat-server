import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendEmail(params: {
    recipient: string;
    subject: string;
    body: string;
    templateCode?: string;
  }) {
    this.logger.log(`[EMAIL DISPATCH] To: ${params.recipient} | Subject: ${params.subject}`);
    const providerMessageId = `msg_email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      await this.prisma.notificationLog.create({
        data: {
          channel: 'EMAIL',
          recipient: params.recipient,
          templateCode: params.templateCode,
          status: 'SENT',
          providerMessageId,
          retryCount: 0,
        },
      });
      return { success: true, providerMessageId };
    } catch (error) {
      this.logger.error('Failed to log email notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Send error' };
    }
  }
}
