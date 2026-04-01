import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:3001').split(','),
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly connectedUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET! });
      this.connectedUsers.set(client.id, payload.sub);
      client.join(`user:${payload.sub}`);
      this.logger.log(`Usuário ${payload.sub} conectado ao chat`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      this.connectedUsers.delete(client.id);
      this.logger.log(`Usuário ${userId} desconectou do chat`);
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    // Validate max message length
    if (!data.content || data.content.length > 5000) {
      return { error: 'Mensagem inválida ou muito longa' };
    }

    // Verify sender is a participant in this conversation
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: data.conversationId,
        OR: [{ athleteId: userId }, { coachId: userId }],
      },
    });
    if (!conv) return { error: 'Acesso negado a esta conversa' };

    const message = await this.chatService.sendMessage(
      data.conversationId,
      userId,
      data.content,
    );

    this.server.to(`conversation:${data.conversationId}`).emit('message:received', message);
    return message;
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    // Verify user is a participant before joining the room
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: data.conversationId,
        OR: [{ athleteId: userId }, { coachId: userId }],
      },
    });
    if (!conv) return { error: 'Acesso negado' };

    client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    client.to(`conversation:${data.conversationId}`).emit('typing:start', { userId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    client.to(`conversation:${data.conversationId}`).emit('typing:stop', { userId });
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await this.chatService.markAsRead(data.conversationId, userId);
    client.to(`conversation:${data.conversationId}`).emit('message:read', { userId });
  }
}
