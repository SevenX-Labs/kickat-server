import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let inAppService: any;

  beforeEach(async () => {
    inAppService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif_1' }),
      getUserNotifications: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
      markAsRead: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
        { provide: SmsService, useValue: { sendSms: jest.fn() } },
        { provide: WhatsappService, useValue: { sendWhatsapp: jest.fn() } },
        { provide: InAppService, useValue: inAppService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should queue order status notification', async () => {
    const res = await service.sendOrderStatusNotification({
      userId: 'user_1',
      email: 'user@example.com',
      orderNumber: 'ORD-123',
      status: 'SHIPPED',
    });

    expect(res.success).toBe(true);
  });

  it('should get user notifications', async () => {
    const res = await service.getUserNotifications('user_1');
    expect(inAppService.getUserNotifications).toHaveBeenCalledWith('user_1', 1, 10);
    expect(res.items).toBeDefined();
  });
});
