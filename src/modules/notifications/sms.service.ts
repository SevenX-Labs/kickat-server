import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendSms(params: {
    recipient: string;
    message: string;
    templateCode?: string;
  }) {
    this.logger.log(`[SMS DISPATCH] To: ${params.recipient} | Message: ${params.message}`);
    const providerMessageId = `msg_sms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      await this.prisma.notificationLog.create({
        data: {
          channel: 'SMS',
          recipient: params.recipient,
          templateCode: params.templateCode,
          status: 'SENT',
          providerMessageId,
          retryCount: 0,
        },
      });
      return { success: true, providerMessageId };
    } catch (error) {
      this.logger.error('Failed to log SMS notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Send error' };
    }
  }
}
