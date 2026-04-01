import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notificações')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações' })
  async list(@CurrentUser('id') userId: string, @Query('page') page?: number) {
    return this.notificationsService.getUserNotifications(userId, page);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar como lida' })
  async markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Post('push-token')
  @ApiOperation({ summary: 'Registrar token de push notification' })
  async registerPushToken(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    return this.notificationsService.registerPushToken(userId, token);
  }
}
