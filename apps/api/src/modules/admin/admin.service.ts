import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
        {
          id: 'MONTHLY',
          name: 'Mensal',
          price: 17400,
          description: 'Pagamento mensal recorrente',
          features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
        },
        {
          id: 'QUARTERLY',
          name: 'Trimestral',
          price: 49500,
          description: 'Parcela única — 3 meses',
          features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
        },
        {
          id: 'SEMIANNUAL',
          name: 'Semestral',
          price: 96000,
          description: 'Parcela única — 6 meses',
          features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
        },
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

  async setUserPassword(id: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true, email: user.email };
  }

  async setUserPasswordByEmail(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { success: true, email: user.email, role: user.role };
  }

  async activateManualSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const now = new Date();
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 1);

    // Cancel any existing subscriptions first
    await this.prisma.subscription.updateMany({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'INCOMPLETE'] as any } },
      data: { status: 'CANCELED' as any },
    });

    const sub = await this.prisma.subscription.create({
      data: {
        userId,
        planType: 'MONTHLY',
        status: 'ACTIVE',
        provider: 'PAGARME',
        externalSubscriptionId: `manual_${userId}_${Date.now()}`,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });

    return { success: true, subscriptionId: sub.id, status: sub.status, validUntil: end };
  }
}
