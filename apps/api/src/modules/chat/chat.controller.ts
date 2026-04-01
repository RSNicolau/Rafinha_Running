import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Listar conversas' })
  async getConversations(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.chatService.getConversations(userId, role);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensagens da conversa' })
  async getMessages(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(id, page, limit);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar mensagem' })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser('id') senderId: string,
    @Body('content') content: string,
  ) {
    return this.chatService.sendMessage(id, senderId, content);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar como lida' })
  async markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chatService.markAsRead(id, userId);
  }
}
