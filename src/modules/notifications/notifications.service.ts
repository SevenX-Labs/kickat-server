import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly whatsappService: WhatsappService,
    private readonly inAppService: InAppService,
  ) {}

  async sendOrderStatusNotification(params: {
    userId: string;
    email?: string;
    phone?: string;
    orderNumber: string;
    status: string;
  }) {
    const title = `Order Status Update - ${params.orderNumber}`;
    const message = `Your order ${params.orderNumber} is now ${params.status.toLowerCase()}.`;

    // Process asynchronously outside HTTP request lifecycle
    setImmediate(async () => {
      await this.inAppService.createNotification(params.userId, title, message, 'ORDER_UPDATE');
      if (params.email) {
        await this.emailService.sendEmail({
          recipient: params.email,
          subject: title,
          body: message,
          templateCode: 'ORDER_STATUS_UPDATE',
        });
      }
      if (params.phone) {
        await this.smsService.sendSms({
          recipient: params.phone,
          message,
          templateCode: 'ORDER_STATUS_SMS',
        });
      }
    });

    return { success: true, message: 'Notification dispatch queued' };
  }

  async getUserNotifications(userId: string, page = 1, limit = 10) {
    return this.inAppService.getUserNotifications(userId, page, limit);
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.inAppService.markAsRead(userId, notificationId);
  }

  async markAllAsRead(userId: string) {
    return this.inAppService.markAllAsRead(userId);
  }
}
