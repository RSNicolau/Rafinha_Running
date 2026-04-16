import { Injectable, NotFoundException } from '@nestjs/common';
import { AthleteLevel, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string, role: string) {
    const where = role === 'COACH' ? { coachId: userId } : { athleteId: userId };

    const conversations = await this.prisma.conversation.findMany({
      where,
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
        return {
          ...conv,
          lastMessage: conv.messages[0] || null,
          otherUser: role === 'COACH' ? conv.athlete : conv.coach,
          unreadCount,
        };
      }),
    );
    return withUnread;
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
