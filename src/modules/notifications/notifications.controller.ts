import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Auth, CurrentUser } from '../../common';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';

@Auth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationsQueryDto,
  ) {
    const res = await this.notificationsService.getUserNotifications(
      userId,
      query.page || 1,
      query.limit || 10,
    );
    return {
      success: true,
      items: res.items,
      pagination: res.pagination,
    };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.markAsRead(userId, notificationId);
    return {
      success: true,
      message: 'Notification marked as read',
    };
  }
}
