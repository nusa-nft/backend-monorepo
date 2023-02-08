import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationQueryParam } from './dto/notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notification')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('/check-new-notification/:userId')
  checkNewNotification(@Param('userId') userId: number) {
    return this.notificationService.checkNewNotification(userId);
  }

  @Get('/:userId')
  getNotification(
    @Param('userId') userId: number,
    @Query() queryParam: NotificationQueryParam,
  ) {
    return this.notificationService.getNotificationData(userId, queryParam);
  }

  @Post('/set-is-seen/:notificationId')
  setIsSeen(@Param('notificationId') notificationId: number) {
    return this.notificationService.setIsSeen(notificationId);
  }
}
