import { StockAlertService } from "./stock-alert.service";
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';
import { InAppService } from './in-app.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    StockAlertService,
    NotificationsService,
    EmailService,
    SmsService,
    WhatsappService,
    InAppService,
  ],
  exports: [
    StockAlertService,
    NotificationsService,
    EmailService,
    SmsService,
    WhatsappService,
    InAppService,
  ],
})
export class NotificationsModule {}
