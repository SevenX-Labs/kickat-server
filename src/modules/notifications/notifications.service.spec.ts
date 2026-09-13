import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let inAppService: any;
  let emailService: any;
  let smsService: any;
  let whatsappService: any;
  let prismaService: any;

  beforeEach(async () => {
    inAppService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif_1' }),
      getUserNotifications: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
      markAsRead: jest.fn().mockResolvedValue({ count: 1 }),
      markAllAsRead: jest.fn().mockResolvedValue({ count: 5 }),
    };

    emailService = { sendEmail: jest.fn().mockResolvedValue({ success: true }) };
    smsService = { sendSms: jest.fn().mockResolvedValue({ success: true }) };
    whatsappService = { sendWhatsapp: jest.fn().mockResolvedValue({ success: true }) };

    prismaService = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          email: 'user@example.com',
          phone: '+919999999999',
          name: 'John Doe',
        }),
      },
      notificationLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'log_1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: EmailService, useValue: emailService },
        { provide: SmsService, useValue: smsService },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: InAppService, useValue: inAppService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

  it('1. Order placed -> dispatches In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyOrderPlaced({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      grandTotal: 1500,
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('2. Payment success -> dispatches In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyPaymentSuccess({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      grandTotal: 1500,
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('3. Payment failure -> dispatches In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyPaymentFailed({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('4. Confirmed status -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'PLACED',
      newStatus: 'CONFIRMED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('5. Packed status -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'CONFIRMED',
      newStatus: 'PACKED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('6. Shipped status -> In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'PACKED',
      newStatus: 'SHIPPED',
      courierPartner: 'BlueDart',
      trackingNumber: 'AWB12345',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('7. Out for delivery status -> In-App, SMS, WhatsApp (No Email)', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'SHIPPED',
      newStatus: 'OUT_FOR_DELIVERY',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('8. Delivered status -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'OUT_FOR_DELIVERY',
      newStatus: 'DELIVERED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('9. Cancelled status -> In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      oldStatus: 'PLACED',
      newStatus: 'CANCELLED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('10. Return requested -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyReturnStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'RETURN_REQUESTED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('11. Return received -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyReturnStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'RETURN_RECEIVED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('12. Online refund initiated -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyRefundStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'ONLINE_REFUND_INITIATED',
      refundAmount: 500,
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('13. Online refund processed -> In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyRefundStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'ONLINE_REFUND_SUCCESS',
      refundAmount: 500,
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('14. Online refund failed -> In-App, Email, WhatsApp (No SMS)', async () => {
    await service.notifyRefundStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'ONLINE_REFUND_FAILED',
      refundAmount: 500,
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('15. COD refund confirmed -> In-App, Email, SMS, WhatsApp', async () => {
    await service.notifyRefundStatus({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
      status: 'COD_REFUND_SUCCESS',
      refundAmount: 500,
      transactionReference: 'UPI/12345',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('16 & 17. Duplicate check skips dispatching when already sent', async () => {
    prismaService.notificationLog.findFirst.mockResolvedValue({ id: 'existing_log' });

    await service.notifyPaymentSuccess({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
    });
    await flushAsync();

    expect(inAppService.createNotification).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('17b. Duplicate status update (same oldStatus & newStatus) -> skipped', async () => {
    const res = await service.notifyOrderStatusChange({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      oldStatus: 'SHIPPED',
      newStatus: 'SHIPPED',
    });

    expect(res.message).toContain('No state transition');
    await flushAsync();

    expect(inAppService.createNotification).not.toHaveBeenCalled();
  });

  it('18. Provider failure isolation -> other channels still proceed and no crash', async () => {
    emailService.sendEmail.mockRejectedValue(new Error('SMTP Timeout'));

    await service.notifyOrderPlaced({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: 'john@example.com',
      phone: '+919876543210',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).toHaveBeenCalled();
  });

  it('19. Missing email/phone -> skips channels safely without error', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await service.sendEventNotification({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
      email: null,
      phone: null,
      eventType: 'ORDER_PLACED',
    });
    await flushAsync();

    expect(inAppService.createNotification).toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('20. User details hydration when email/phone omitted in params', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'hydrated@example.com',
      phone: '+918888888888',
      name: 'Hydrated User',
    });

    await service.notifyOrderPlaced({
      orderId: 'ord_1',
      orderNumber: 'ORD-001',
      userId: 'user_1',
    });
    await flushAsync();

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { email: true, phone: true, name: true },
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'hydrated@example.com' }),
    );
  });
});
