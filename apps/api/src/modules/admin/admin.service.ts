import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SubscriptionStatus, WorkoutStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true,
          avatarUrl: true, isActive: true, createdAt: true,
          subscriptions: { where: { status: SubscriptionStatus.ACTIVE }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getAnalytics() {
    const [totalUsers, athletes, coaches, activeSubscriptions, totalRevenue, workoutsCompleted] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: UserRole.ATHLETE } }),
        this.prisma.user.count({ where: { role: UserRole.COACH } }),
        this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
        this.prisma.payment.aggregate({
          where: { status: 'SUCCEEDED' },
          _sum: { amount: true },
        }),
        this.prisma.workout.count({ where: { status: WorkoutStatus.COMPLETED } }),
      ]);

    return {
      totalUsers,
      athletes,
      coaches,
      activeSubscriptions,
      totalRevenueCents: totalRevenue._sum.amount || 0,
      workoutsCompleted,
      conversionRate: totalUsers > 0 ? Math.round((activeSubscriptions / athletes) * 100) : 0,
    };
  }

  async getThemeConfig() {
    const config = await this.prisma.appConfig.findUnique({ where: { key: 'theme' } });
    return config?.value || {
      primaryColor: '#DC2626',
      secondaryColor: '#FFFFFF',
      logoUrl: null,
      fontFamily: 'Inter',
    };
  }

  async updateThemeConfig(theme: Record<string, any>) {
    return this.prisma.appConfig.upsert({
      where: { key: 'theme' },
      create: { key: 'theme', value: theme },
      update: { value: theme },
    });
  }

  async deleteUser(id: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: actorId ?? id,
          action: 'DEACTIVATE_USER',
          entityType: 'User',
          entityId: id,
          metadata: { email: user.email, role: user.role },
        },
      }),
    ]);

    return { success: true };
  }

  async hardDeleteUser(id: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Soft delete: deactivate + cancel subscriptions + write audit log
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      }),
      this.prisma.subscription.updateMany({
        where: { userId: id },
        data: { status: 'CANCELED' as any },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: actorId ?? id,
          action: 'DELETE_USER',
          entityType: 'User',
          entityId: id,
          metadata: { email: user.email, role: user.role },
        },
      }),
    ]);

    return { message: 'Usuário desativado com sucesso' };
  }

  async updateUserRole(id: string, role: UserRole) {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async getPlansConfig() {
    const config = await this.prisma.appConfig.findUnique({ where: { key: 'plans' } });
    return config?.value || {
      coach: [
        { id: 'MONTHLY', name: 'Básico', price: 4900, description: 'Para coaches iniciando', features: ['Até 15 atletas', 'Planilhas ilimitadas', 'Sync Garmin & Strava'] },
        { id: 'PRO', name: 'Pro', price: 9900, description: 'Para assessorias em crescimento', features: ['Até 50 atletas', 'IA para planilhas', 'Live Tracking'] },
        { id: 'ELITE', name: 'Elite', price: 19900, description: 'Para grandes assessorias', features: ['Atletas ilimitados', 'Múltiplos coaches', 'Suporte VIP'] },
      ],
      athlete: [
        { id: 'MONTHLY', name: 'Plano Atleta', price: 2900, description: 'Acesso completo à plataforma', features: ['Planilha do coach', 'Sync Garmin & Strava', 'Live Tracking', 'Ranking'] },
      ],
    };
  }

  async updatePlansConfig(plans: Record<string, any>) {
    return this.prisma.appConfig.upsert({
      where: { key: 'plans' },
      create: { key: 'plans', value: plans },
      update: { value: plans },
    });
  }
}
