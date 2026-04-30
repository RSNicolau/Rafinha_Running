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
        { id: 'STARTER', name: 'Starter', price: 19700, description: 'Para coaches iniciando', features: ['Até 30 atletas', 'Questionário de anamnese', 'Planos de treino', 'App para atletas', 'Loja virtual'] },
        { id: 'PRO',     name: 'Pro',     price: 39700, description: 'Para assessorias em crescimento', features: ['Até 100 atletas', 'Tudo do Starter', 'Coach Brain IA', 'Eventos e provas', 'Relatórios avançados'] },
        { id: 'SCALE',   name: 'Scale',   price: 69700, description: 'Para assessorias escalando', features: ['Até 300 atletas', 'Tudo do Pro', 'Multi-coach', 'Dashboard analítico', 'Acesso à API'] },
        { id: 'ELITE',   name: 'Elite',   price: 99700, description: 'Para grandes assessorias', features: ['Atletas ilimitados', 'Tudo do Scale', 'SLA garantido', 'Integração Garmin/Strava', 'Onboarding dedicado'] },
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

  async setCoachSlug(userId: string, slug: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const existing = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.coachProfile.update({ where: { userId }, data: { slug } });
    } else {
      await this.prisma.coachProfile.create({ data: { userId, slug, maxAthletes: 999 } });
    }
    return { success: true, userId, slug };
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

  // ── Platform / Split Payments ──

  async getCoaches() {
    return this.prisma.user.findMany({
      where: { role: { in: [UserRole.COACH, UserRole.ADMIN] } },
      select: {
        id: true, name: true, email: true, avatarUrl: true, isActive: true, createdAt: true,
        coachProfile: {
          select: {
            slug: true, maxAthletes: true, paymentEnabled: true,
            platformFeePercent: true,
          },
        },
        _count: { select: { coachAthletes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlatformStats() {
    const [totalCoaches, activeCoaches, totalAthletes, revenueResult] = await Promise.all([
      this.prisma.user.count({ where: { role: { in: [UserRole.COACH, UserRole.ADMIN] } } }),
      this.prisma.user.count({ where: { role: { in: [UserRole.COACH, UserRole.ADMIN] }, isActive: true } }),
      this.prisma.user.count({ where: { role: UserRole.ATHLETE } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } }),
    ]);

    return {
      totalCoaches,
      activeCoaches,
      totalAthletes,
      totalRevenue: revenueResult._sum.amount || 0,
    };
  }

  async setCoachPlatformFee(coachId: string, platformFeePercent: number) {
    const user = await this.prisma.user.findUnique({ where: { id: coachId } });
    if (!user) throw new NotFoundException('Coach não encontrado');

    const fee = Math.min(Math.max(platformFeePercent, 0), 50); // clamp 0-50%

    // Upsert coach profile with the fee
    await this.prisma.coachProfile.upsert({
      where: { userId: coachId },
      create: { userId: coachId, maxAthletes: 30, platformFeePercent: fee },
      update: { platformFeePercent: fee },
    });

    return { success: true, coachId, platformFeePercent: fee };
  }

  async setUserActiveStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    await this.prisma.user.update({ where: { id: userId }, data: { isActive } });
    return { success: true, userId, isActive };
  }
}
