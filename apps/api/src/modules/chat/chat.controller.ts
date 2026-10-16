import { Controller, Get, Post, Body, Param, Query, UseGuards, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BroadcastDto, CreateConversationDto, MessagesQueryDto, SendMessageDto } from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ChatController {
  constructor(
    private chatService: ChatService,
    @Optional() private chatGateway?: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar conversas' })
  async getConversations(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.chatService.getConversations(userId, role);
  }

  @Post()
  @ApiOperation({ summary: 'Obter ou criar conversa (o lado do chamador vem do token)' })
  async getOrCreate(@CurrentUser() user: any, @Body() dto: CreateConversationDto) {
    return this.chatService.getOrCreateForUser(user, dto);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Enviar mensagem para grupo de atletas' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async broadcast(@CurrentUser('id') coachId: string, @Body() dto: BroadcastDto) {
    return this.chatService.broadcastMessage(coachId, dto.message, dto.targetGroup ?? 'ALL');
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensagens da conversa' })
  async getMessages(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query() query: MessagesQueryDto,
  ) {
    await this.chatService.assertParticipant(id, user);
    return this.chatService.getMessages(id, query.page ?? 1, query.limit ?? 50);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar mensagem' })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    const conv = await this.chatService.assertParticipant(id, user);
    const message = await this.chatService.sendMessage(id, user.id, dto.content);
    this.chatGateway?.notifyMessage(conv, message);
    return message;
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar como lida' })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    await this.chatService.assertParticipant(id, user);
    return this.chatService.markAsRead(id, user.id);
  }
}
