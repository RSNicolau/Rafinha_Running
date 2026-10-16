import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AthleteLevel, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCoachOwnsAthlete, AuthUserLike, isPlatformAdmin } from '../../common/utils/ownership';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Conversas em que o usuário participa (como treinador OU como atleta — ADMIN/OWNER também podem
   * ser treinadores). `otherUser` é SEMPRE o outro participante (título da conversa).
   */
  async getConversations(userId: string, _role?: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ coachId: userId }, { athleteId: userId }] },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
        coach: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const withUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            readAt: null,
          },
        });
        return this.decorate(conv, userId, unreadCount);
      }),
    );
    return withUnread;
  }

  /** Acrescenta lastMessage / otherUser / myRole do ponto de vista de `userId`. */
  decorate(conv: any, userId: string, unreadCount = 0) {
    const iAmCoach = conv.coachId === userId;
    return {
      ...conv,
      lastMessage: conv.messages?.[0] || null,
      otherUser: iAmCoach ? conv.athlete : conv.coach,
      myRole: iAmCoach ? 'COACH' : 'ATHLETE',
      unreadCount,
    };
  }

  /**
   * Garante que o usuário participa da conversa (ADMIN/SUPER_ADMIN liberados). 404 se não participa.
   */
  async assertParticipant(conversationId: string, user: AuthUserLike) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, athleteId: true, coachId: true },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    if (isPlatformAdmin(user)) return conv;
    if (conv.athleteId !== user.id && conv.coachId !== user.id) {
      throw new NotFoundException('Conversa não encontrada');
    }
    return conv;
  }

  /**
   * Obtém/cria conversa derivando o lado do chamador do JWT:
   *  - COACH: coachId = ele mesmo; athleteId precisa ser atleta dele.
   *  - ATHLETE: athleteId = ele mesmo; coachId = seu treinador (se informado, precisa coincidir).
   *  - ADMIN/SUPER_ADMIN: informa ambos; o atleta precisa estar vinculado a esse coach.
   */
  async getOrCreateForUser(
    user: AuthUserLike,
    dto: { athleteId?: string; coachId?: string; message?: string },
  ) {
    let athleteId: string;
    let coachId: string;

    if (user.role === 'ATHLETE') {
      athleteId = user.id;
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: user.id },
        select: { coachId: true },
      });
      if (!profile?.coachId) throw new BadRequestException('Você ainda não está vinculado a um treinador');
      if (dto.coachId && dto.coachId !== profile.coachId) throw new ForbiddenException('Acesso negado');
      coachId = profile.coachId;
    } else if (user.role === 'COACH') {
      if (!dto.athleteId) throw new BadRequestException('athleteId é obrigatório');
      coachId = user.id;
      athleteId = dto.athleteId;
      await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
    } else if (isPlatformAdmin(user)) {
      if (!dto.athleteId) throw new BadRequestException('athleteId é obrigatório');
      athleteId = dto.athleteId;
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: athleteId },
        select: { coachId: true },
      });
      if (!profile) throw new NotFoundException('Atleta não encontrado');
      coachId = dto.coachId ?? profile.coachId ?? user.id;
      if (profile.coachId !== coachId && coachId !== user.id) {
        throw new BadRequestException('O atleta não está vinculado a este treinador');
      }
    } else {
      throw new ForbiddenException('Acesso negado');
    }

    const conversation = await this.getOrCreateConversation(athleteId, coachId);
    if (dto.message && dto.message.trim()) {
      await this.sendMessage(conversation.id, user.id, dto.message.trim());
    }
    const full = await this.prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
        coach: { select: { id: true, name: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return this.decorate(full ?? conversation, user.id);
  }

  async getMessages(conversationId: string, page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const total = await this.prisma.message.count({ where: { conversationId } });
    const totalPages = Math.ceil(total / safeLimit);
    // Fetch oldest-first for the requested page using cursor-based skip
    const skip = Math.max(0, total - page * safeLimit);
    const take = Math.min(safeLimit, total - (page - 1) * safeLimit);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    });

    return { data: messages, total, page, totalPages };
  }

  async sendMessage(conversationId: string, senderId: string, content: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const message = await this.prisma.message.create({
      data: { conversationId, senderId, content },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  async markAsRead(conversationId: string, userId: string) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  /** Interno: NÃO verifica permissão — use getOrCreateForUser a partir de rotas. */
  async getOrCreateConversation(athleteId: string, coachId: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: { athleteId, coachId },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { athleteId, coachId },
      });
    }

    return conversation;
  }

  async broadcastMessage(
    coachId: string,
    message: string,
    targetGroup: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE',
  ): Promise<{ sent: number }> {
    // Find athletes for this coach, optionally filtered by level
    const levelFilter =
      targetGroup !== 'ALL'
        ? { level: targetGroup as AthleteLevel }
        : {};

    const athleteProfiles = await this.prisma.athleteProfile.findMany({
      where: {
        coachId,
        user: { deletedAt: null },
        ...levelFilter,
      },
      select: { userId: true, user: { select: { name: true } } },
    });

    let sent = 0;

    for (const ap of athleteProfiles) {
      try {
        // Get or create conversation
        const conversation = await this.getOrCreateConversation(ap.userId, coachId);

        // Create message in conversation
        await this.prisma.message.create({
          data: { conversationId: conversation.id, senderId: coachId, content: message },
        });

        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        // Create notification for athlete
        await this.prisma.notification.create({
          data: {
            userId: ap.userId,
            type: NotificationType.NEW_MESSAGE,
            title: 'Nova mensagem do coach',
            body: message.length > 100 ? message.slice(0, 97) + '...' : message,
          },
        });

        sent++;
      } catch {
        // Continue with other athletes if one fails
      }
    }

    return { sent };
  }
}
