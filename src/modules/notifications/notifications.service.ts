import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';
import { PrismaService } from '../../prisma/prisma.service';

export type EcommerceEventType =
  | 'ORDER_PLACED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'ORDER_STATUS_CONFIRMED'
  | 'ORDER_STATUS_PACKED'
  | 'ORDER_STATUS_SHIPPED'
  | 'ORDER_STATUS_OUT_FOR_DELIVERY'
  | 'ORDER_STATUS_DELIVERED'
  | 'ORDER_STATUS_CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_RECEIVED'
  | 'ONLINE_REFUND_INITIATED'
  | 'ONLINE_REFUND_SUCCESS'
  | 'ONLINE_REFUND_FAILED'
  | 'COD_REFUND_SUCCESS';

export interface EventNotificationParams {
  orderId: string;
  orderNumber: string;
  userId: string;
  email?: string | null;
  phone?: string | null;
  customerName?: string | null;
  grandTotal?: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  orderStatus?: string;
  trackingNumber?: string | null;
  courierPartner?: string | null;
  estimatedDelivery?: Date | string | null;
  refundAmount?: number;
  transactionReference?: string | null;
  reason?: string | null;
  eventType: EcommerceEventType;
  idempotencyKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly whatsappService: WhatsappService,
    private readonly inAppService: InAppService,
  ) {}

  private getChannelsForEvent(eventType: EcommerceEventType): {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  } {
    switch (eventType) {
      case 'ORDER_PLACED':
      case 'PAYMENT_SUCCESS':
      case 'PAYMENT_FAILED':
      case 'ORDER_STATUS_SHIPPED':
      case 'ORDER_STATUS_CANCELLED':
      case 'ONLINE_REFUND_SUCCESS':
      case 'COD_REFUND_SUCCESS':
        return { inApp: true, email: true, sms: true, whatsapp: true };

      case 'ORDER_STATUS_OUT_FOR_DELIVERY':
        return { inApp: true, email: false, sms: true, whatsapp: true };

      case 'ORDER_STATUS_CONFIRMED':
      case 'ORDER_STATUS_PACKED':
      case 'ORDER_STATUS_DELIVERED':
      case 'RETURN_REQUESTED':
      case 'RETURN_RECEIVED':
      case 'ONLINE_REFUND_INITIATED':
      case 'ONLINE_REFUND_FAILED':
        return { inApp: true, email: true, sms: false, whatsapp: true };

      default:
        return { inApp: true, email: true, sms: false, whatsapp: false };
    }
  }

  private buildNotificationContent(params: EventNotificationParams) {
    const orderRef = params.orderNumber || params.orderId;
    const nameStr = params.customerName ? `Hi ${params.customerName}, ` : '';
    const amountStr = params.grandTotal !== undefined && params.grandTotal !== null ? `₹${params.grandTotal}` : '';
    const refundStr = params.refundAmount !== undefined && params.refundAmount !== null ? `₹${params.refundAmount}` : '';

    switch (params.eventType) {
      case 'ORDER_PLACED':
        return {
          title: `Order Placed - ${orderRef}`,
          message: `${nameStr}your order ${orderRef}${amountStr ? ` for ${amountStr}` : ''} has been placed successfully!`,
        };
      case 'PAYMENT_SUCCESS':
        return {
          title: `Payment Successful - ${orderRef}`,
          message: `${nameStr}payment${amountStr ? ` of ${amountStr}` : ''} for order ${orderRef} was successfully confirmed.`,
        };
      case 'PAYMENT_FAILED':
        return {
          title: `Payment Failed - ${orderRef}`,
          message: `${nameStr}payment for order ${orderRef} failed. Please try again or update your payment method.`,
        };
      case 'ORDER_STATUS_CONFIRMED':
        return {
          title: `Order Confirmed - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has been confirmed and is being processed.`,
        };
      case 'ORDER_STATUS_PACKED':
        return {
          title: `Order Packed - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has been packed and is ready for dispatch.`,
        };
      case 'ORDER_STATUS_SHIPPED': {
        const trackingDetails = [
          params.courierPartner ? `via ${params.courierPartner}` : null,
          params.trackingNumber ? `(AWB: ${params.trackingNumber})` : null,
        ].filter(Boolean).join(' ');
        return {
          title: `Order Shipped - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has been shipped ${trackingDetails}`.trim(),
        };
      }
      case 'ORDER_STATUS_OUT_FOR_DELIVERY':
        return {
          title: `Out for Delivery - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} is out for delivery today!`,
        };
      case 'ORDER_STATUS_DELIVERED':
        return {
          title: `Order Delivered - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has been delivered. Thank you for shopping with Kickat!`,
        };
      case 'ORDER_STATUS_CANCELLED':
        return {
          title: `Order Cancelled - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has been cancelled.`,
        };
      case 'RETURN_REQUESTED':
        return {
          title: `Return Requested - ${orderRef}`,
          message: `${nameStr}your return request for order ${orderRef} has been submitted.`,
        };
      case 'RETURN_RECEIVED':
        return {
          title: `Return Received - ${orderRef}`,
          message: `${nameStr}we have received your returned item(s) for order ${orderRef}.`,
        };
      case 'ONLINE_REFUND_INITIATED':
        return {
          title: `Refund Initiated - ${orderRef}`,
          message: `${nameStr}refund${refundStr ? ` of ${refundStr}` : ''} for order ${orderRef} has been initiated.`,
        };
      case 'ONLINE_REFUND_SUCCESS':
        return {
          title: `Refund Processed - ${orderRef}`,
          message: `${nameStr}refund${refundStr ? ` of ${refundStr}` : ''} for order ${orderRef} has been processed successfully to your account.`,
        };
      case 'ONLINE_REFUND_FAILED':
        return {
          title: `Refund Issue - ${orderRef}`,
          message: `${nameStr}there was an issue processing your refund${refundStr ? ` of ${refundStr}` : ''} for order ${orderRef}. Our support team will assist you.`,
        };
      case 'COD_REFUND_SUCCESS': {
        const refInfo = params.transactionReference ? ` (Ref: ${params.transactionReference})` : '';
        return {
          title: `COD Refund Confirmed - ${orderRef}`,
          message: `${nameStr}your COD refund${refundStr ? ` of ${refundStr}` : ''} for order ${orderRef} has been successfully completed${refInfo}.`,
        };
      }
      default:
        return {
          title: `Order Update - ${orderRef}`,
          message: `${nameStr}your order ${orderRef} has an update.`,
        };
    }
  }

  private async isChannelAlreadyDispatched(idempotencyProviderMessageId: string): Promise<boolean> {
    try {
      const existing = await this.prisma.notificationLog.findFirst({
        where: { providerMessageId: idempotencyProviderMessageId },
      });
      return !!existing;
    } catch {
      return false;
    }
  }

  async sendEventNotification(params: EventNotificationParams) {
    const baseIdempotency = params.idempotencyKey || `evt_${params.orderId}_${params.eventType}`;

    setImmediate(async () => {
      try {
        let recipientEmail = params.email;
        let recipientPhone = params.phone;
        let customerName = params.customerName;

        if ((!recipientEmail || !recipientPhone || !customerName) && params.userId) {
          try {
            const user = await this.prisma.user.findUnique({
              where: { id: params.userId },
              select: { email: true, phone: true, name: true },
            });
            if (user) {
              if (!recipientEmail) recipientEmail = user.email;
              if (!recipientPhone) recipientPhone = user.phone;
              if (!customerName) customerName = user.name;
            }
          } catch (err) {
            this.logger.error('Failed to hydrate user details for notification:', err);
          }
        }

        const hydratedParams = {
          ...params,
          email: recipientEmail,
          phone: recipientPhone,
          customerName,
        };

        const channels = this.getChannelsForEvent(params.eventType);
        const content = this.buildNotificationContent(hydratedParams);

        // 1. In-App Notification
        if (channels.inApp && params.userId) {
          const inAppId = `${baseIdempotency}_IN_APP`;
          const alreadySent = await this.isChannelAlreadyDispatched(inAppId);
          if (!alreadySent) {
            try {
              await this.inAppService.createNotification(
                params.userId,
                content.title,
                content.message,
                params.eventType,
              );
              await this.prisma.notificationLog.create({
                data: {
                  channel: 'IN_APP',
                  recipient: params.userId,
                  templateCode: params.eventType,
                  status: 'SENT',
                  providerMessageId: inAppId,
                },
              });
            } catch (err: any) {
              this.logger.error(`Failed in-app notification for ${inAppId}:`, err);
            }
          }
        }

        // 2. Email Notification
        if (channels.email && recipientEmail) {
          const emailId = `${baseIdempotency}_EMAIL`;
          const alreadySent = await this.isChannelAlreadyDispatched(emailId);
          if (!alreadySent) {
            try {
              await this.emailService.sendEmail({
                recipient: recipientEmail,
                subject: content.title,
                body: content.message,
                templateCode: params.eventType,
                providerMessageId: emailId,
              });
            } catch (err: any) {
              this.logger.error(`Failed email notification for ${emailId}:`, err);
            }
          }
        }

        // 3. SMS Notification
        if (channels.sms && recipientPhone) {
          const smsId = `${baseIdempotency}_SMS`;
          const alreadySent = await this.isChannelAlreadyDispatched(smsId);
          if (!alreadySent) {
            try {
              await this.smsService.sendSms({
                recipient: recipientPhone,
                message: content.message,
                templateCode: params.eventType,
                providerMessageId: smsId,
              });
            } catch (err: any) {
              this.logger.error(`Failed sms notification for ${smsId}:`, err);
            }
          }
        }

        // 4. WhatsApp Notification
        if (channels.whatsapp && recipientPhone) {
          const waId = `${baseIdempotency}_WHATSAPP`;
          const alreadySent = await this.isChannelAlreadyDispatched(waId);
          if (!alreadySent) {
            try {
              await this.whatsappService.sendWhatsapp({
                recipient: recipientPhone,
                message: content.message,
                templateCode: params.eventType,
                providerMessageId: waId,
              });
            } catch (err: any) {
              this.logger.error(`Failed whatsapp notification for ${waId}:`, err);
            }
          }
        }
      } catch (globalErr) {
        this.logger.error('Unhandled error in sendEventNotification async execution:', globalErr);
      }
    });

    return { success: true, message: 'Notification dispatch queued' };
  }

  // Backwards compatible method
  async sendOrderStatusNotification(params: {
    userId: string;
    email?: string;
    phone?: string;
    orderNumber: string;
    status: string;
  }) {
    const statusUpper = params.status.toUpperCase();
    let eventType: EcommerceEventType = 'ORDER_STATUS_CONFIRMED';
    if (statusUpper === 'CONFIRMED') eventType = 'ORDER_STATUS_CONFIRMED';
    else if (statusUpper === 'PACKED') eventType = 'ORDER_STATUS_PACKED';
    else if (statusUpper === 'SHIPPED') eventType = 'ORDER_STATUS_SHIPPED';
    else if (statusUpper === 'OUT_FOR_DELIVERY') eventType = 'ORDER_STATUS_OUT_FOR_DELIVERY';
    else if (statusUpper === 'DELIVERED') eventType = 'ORDER_STATUS_DELIVERED';
    else if (statusUpper === 'CANCELLED') eventType = 'ORDER_STATUS_CANCELLED';

    return this.sendEventNotification({
      orderId: params.orderNumber,
      orderNumber: params.orderNumber,
      userId: params.userId,
      email: params.email,
      phone: params.phone,
      orderStatus: params.status,
      eventType,
    });
  }

  async notifyOrderPlaced(params: Omit<EventNotificationParams, 'eventType'>) {
    return this.sendEventNotification({ ...params, eventType: 'ORDER_PLACED' });
  }

  async notifyPaymentSuccess(params: Omit<EventNotificationParams, 'eventType'>) {
    return this.sendEventNotification({ ...params, eventType: 'PAYMENT_SUCCESS' });
  }

  async notifyPaymentFailed(params: Omit<EventNotificationParams, 'eventType'>) {
    return this.sendEventNotification({ ...params, eventType: 'PAYMENT_FAILED' });
  }

  async notifyOrderStatusChange(params: {
    orderId: string;
    orderNumber: string;
    userId: string;
    email?: string | null;
    phone?: string | null;
    oldStatus?: string;
    newStatus: string;
    trackingNumber?: string | null;
    courierPartner?: string | null;
    estimatedDelivery?: Date | string | null;
  }) {
    if (params.oldStatus && params.oldStatus === params.newStatus) {
      return { success: true, message: 'No state transition, notification skipped' };
    }

    const statusUpper = params.newStatus.toUpperCase();
    let eventType: EcommerceEventType | null = null;
    if (statusUpper === 'CONFIRMED') eventType = 'ORDER_STATUS_CONFIRMED';
    else if (statusUpper === 'PACKED') eventType = 'ORDER_STATUS_PACKED';
    else if (statusUpper === 'SHIPPED') eventType = 'ORDER_STATUS_SHIPPED';
    else if (statusUpper === 'OUT_FOR_DELIVERY') eventType = 'ORDER_STATUS_OUT_FOR_DELIVERY';
    else if (statusUpper === 'DELIVERED') eventType = 'ORDER_STATUS_DELIVERED';
    else if (statusUpper === 'CANCELLED') eventType = 'ORDER_STATUS_CANCELLED';

    if (!eventType) {
      return { success: true, message: `Status ${params.newStatus} does not require customer notification` };
    }

    return this.sendEventNotification({
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      userId: params.userId,
      email: params.email,
      phone: params.phone,
      orderStatus: params.newStatus,
      trackingNumber: params.trackingNumber,
      courierPartner: params.courierPartner,
      estimatedDelivery: params.estimatedDelivery,
      eventType,
      idempotencyKey: `evt_status_${params.orderId}_${statusUpper}`,
    });
  }

  async notifyReturnStatus(params: {
    orderId: string;
    orderNumber: string;
    userId: string;
    email?: string | null;
    phone?: string | null;
    status: 'RETURN_REQUESTED' | 'RETURN_RECEIVED';
  }) {
    const eventType: EcommerceEventType =
      params.status === 'RETURN_REQUESTED' ? 'RETURN_REQUESTED' : 'RETURN_RECEIVED';

    return this.sendEventNotification({
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      userId: params.userId,
      email: params.email,
      phone: params.phone,
      eventType,
      idempotencyKey: `evt_return_${params.orderId}_${params.status}`,
    });
  }

  async notifyRefundStatus(params: {
    orderId: string;
    orderNumber: string;
    userId: string;
    email?: string | null;
    phone?: string | null;
    status: 'ONLINE_REFUND_INITIATED' | 'ONLINE_REFUND_SUCCESS' | 'ONLINE_REFUND_FAILED' | 'COD_REFUND_SUCCESS';
    refundAmount?: number;
    transactionReference?: string;
  }) {
    return this.sendEventNotification({
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      userId: params.userId,
      email: params.email,
      phone: params.phone,
      refundAmount: params.refundAmount,
      transactionReference: params.transactionReference,
      eventType: params.status,
      idempotencyKey: `evt_refund_${params.orderId}_${params.status}`,
    });
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
