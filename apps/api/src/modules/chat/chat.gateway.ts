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

      const payload: any = this.jwtService.verify(token, { secret: process.env.JWT_SECRET! });
      if (!payload?.sub || payload.purpose) {
        client.disconnect();
        return;
      }
      // Mesmas regras do JwtStrategy: usuário ativo e tokenVersion (`tv`) atual
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true, deletedAt: true, tokenVersion: true },
      });
      if (!user || !user.isActive || user.deletedAt || payload.tv !== (user.tokenVersion ?? 0)) {
        client.disconnect();
        return;
      }
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
    if (!data || typeof data.content !== 'string' || typeof data.conversationId !== 'string' || !data.content || data.content.length > 5000) {
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
    this.server
      .to(`user:${conv.athleteId}`)
      .to(`user:${conv.coachId}`)
      .emit('conversation:updated', { conversationId: conv.id, message });
    return message;
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId || typeof data?.conversationId !== 'string') return;

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
    if (!userId || !this.inRoom(client, data?.conversationId)) return;
    client.to(`conversation:${data.conversationId}`).emit('typing:start', { userId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId || !this.inRoom(client, data?.conversationId)) return;
    client.to(`conversation:${data.conversationId}`).emit('typing:stop', { userId });
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId || typeof data?.conversationId !== 'string') return;

    // Só marca como lida conversas das quais o usuário participa
    const conv = await this.prisma.conversation.findFirst({
      where: { id: data.conversationId, OR: [{ athleteId: userId }, { coachId: userId }] },
      select: { id: true },
    });
    if (!conv) return { error: 'Acesso negado' };

    await this.chatService.markAsRead(data.conversationId, userId);
    client.to(`conversation:${data.conversationId}`).emit('message:read', { userId });
  }

  /**
   * Notifica em tempo real uma mensagem enviada via REST: sala da conversa + sala pessoal dos
   * participantes (para quem ainda não abriu a conversa atualizar a lista).
   */
  notifyMessage(conversation: { id: string; athleteId: string; coachId: string }, message: any) {
    if (!this.server) return;
    try {
      this.server.to(`conversation:${conversation.id}`).emit('message:received', message);
      this.server
        .to(`user:${conversation.athleteId}`)
        .to(`user:${conversation.coachId}`)
        .emit('conversation:updated', { conversationId: conversation.id, message });
    } catch (e) {
      this.logger.warn(`Falha ao notificar mensagem: ${e}`);
    }
  }

  /** Só sockets que entraram na sala (após checagem de participação) podem emitir para ela. */
  private inRoom(client: Socket, conversationId: unknown): boolean {
    return typeof conversationId === 'string' && client.rooms.has(`conversation:${conversationId}`);
  }
}
