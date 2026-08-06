import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let inAppService: any;
  let emailService: any;
  let smsService: any;

  beforeEach(async () => {
    inAppService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif_1' }),
      getUserNotifications: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
      markAsRead: jest.fn().mockResolvedValue({ count: 1 }),
      markAllAsRead: jest.fn().mockResolvedValue({ count: 5 }),
    };

    emailService = { sendEmail: jest.fn().mockResolvedValue({ success: true }) };
    smsService = { sendSms: jest.fn().mockResolvedValue({ success: true }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: EmailService, useValue: emailService },
        { provide: SmsService, useValue: smsService },
        { provide: WhatsappService, useValue: { sendWhatsapp: jest.fn() } },
        { provide: InAppService, useValue: inAppService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should queue order status notification asynchronously', async () => {
    const res = await service.sendOrderStatusNotification({
      userId: 'user_1',
      email: 'user@example.com',
      phone: '+919999999999',
      orderNumber: 'ORD-123',
      status: 'SHIPPED',
    });

    expect(res.success).toBe(true);
    expect(res.message).toBe('Notification dispatch queued');
  });

  it('should get user notifications', async () => {
    const res = await service.getUserNotifications('user_1');
    expect(inAppService.getUserNotifications).toHaveBeenCalledWith('user_1', 1, 10);
    expect(res.items).toBeDefined();
  });

  it('should mark single notification as read', async () => {
    const res = await service.markAsRead('user_1', 'notif_1');
    expect(inAppService.markAsRead).toHaveBeenCalledWith('user_1', 'notif_1');
  });

  it('should mark all notifications as read', async () => {
    const res = await service.markAllAsRead('user_1');
    expect(inAppService.markAllAsRead).toHaveBeenCalledWith('user_1');
    expect(res.count).toBe(5);
  });
});
