import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { findUserByEmail } from '../../common/utils/email';
import { Prisma, UserRole, SubscriptionStatus, WorkoutStatus } from '@prisma/client';
import { sanitizeSlug } from '../../common/validators/slug';

export interface AdminActor {
  id: string;
  role: UserRole | string;
}

/**
 * "Treinador" para métricas/listagem da plataforma: papel COACH que é dono de uma equipe
 * ou membro ativo de alguma. ADMIN/SUPER_ADMIN (equipe da plataforma) não contam.
 */
export const COACH_WHERE: Prisma.UserWhereInput = {
  role: UserRole.COACH,
  OR: [{ ownedTeams: { some: {} } }, { teamMemberships: { some: { isActive: true } } }],
};

const SUPER_ADMIN_ONLY_MSG = 'Apenas SUPER_ADMIN pode executar esta ação';

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

  /** Apenas SUPER_ADMIN pode agir sobre contas SUPER_ADMIN. */
  private assertCanManage(target: { role: UserRole | string }, actor?: AdminActor) {
    if (target.role === UserRole.SUPER_ADMIN && actor?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(SUPER_ADMIN_ONLY_MSG);
    }
  }

  private assertSuperAdmin(actor?: AdminActor) {
    if (actor?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(SUPER_ADMIN_ONLY_MSG);
    }
  }

  async deleteUser(id: string, actor?: AdminActor) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanManage(user, actor);
    const actorId = actor?.id;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 } },
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

  async hardDeleteUser(id: string, actor?: AdminActor) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanManage(user, actor);
    const actorId = actor?.id;

    // Soft delete: deactivate + cancel subscriptions + write audit log
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 } },
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

  async updateUserRole(id: string, role: UserRole, actor?: AdminActor) {
    // Rota já é @Roles(SUPER_ADMIN); checagem repetida aqui como defesa em profundidade
    this.assertSuperAdmin(actor);
    if (!Object.values(UserRole).includes(role)) throw new BadRequestException('Papel inválido');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (actor && actor.id === id && role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Você não pode remover o seu próprio acesso de SUPER_ADMIN');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      // Mudança de papel revoga sessões: o novo papel vale a partir do próximo login
      data: { role, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
    });
    await this.prisma.auditLog
      .create({
        data: {
          actorId: actor?.id ?? id,
          action: 'UPDATE_USER_ROLE',
          entityType: 'User',
          entityId: id,
          metadata: { from: user.role, to: role },
        },
      })
      .catch(() => {});
    return updated;
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

  private assertPassword(password: string) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
    }
  }

  async setUserPassword(id: string, password: string, actor?: AdminActor) {
    this.assertSuperAdmin(actor);
    this.assertPassword(password);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const passwordHash = await bcrypt.hash(password, 12);
    // Nova senha revoga todas as sessões do usuário
    await this.prisma.user.update({ where: { id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await this.prisma.auditLog
      .create({ data: { actorId: actor?.id ?? id, action: 'ADMIN_SET_PASSWORD', entityType: 'User', entityId: id, metadata: {} } })
      .catch(() => {});
    return { success: true, email: user.email };
  }

  async setUserPasswordByEmail(email: string, password: string, actor?: AdminActor) {
    this.assertSuperAdmin(actor);
    this.assertPassword(password);
    const user: any = await findUserByEmail(this.prisma, email);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await this.prisma.auditLog
      .create({ data: { actorId: actor?.id ?? user.id, action: 'ADMIN_SET_PASSWORD', entityType: 'User', entityId: user.id, metadata: {} } })
      .catch(() => {});
    return { success: true, email: user.email, role: user.role };
  }

  async setCoachSlug(userId: string, rawSlug: string) {
    const slug = sanitizeSlug(rawSlug);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const taken = await this.prisma.coachProfile.findFirst({
      where: { slug, NOT: { userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Este slug já está em uso por outro treinador');

    try {
      const existing = await this.prisma.coachProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.coachProfile.update({ where: { userId }, data: { slug } });
      } else {
        await this.prisma.coachProfile.create({ data: { userId, slug, maxAthletes: 999 } });
      }
    } catch (err: any) {
      // Corrida entre duas requisições: a unique do banco é a palavra final
      if (err?.code === 'P2002') throw new ConflictException('Este slug já está em uso por outro treinador');
      throw err;
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
      where: COACH_WHERE,
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
      this.prisma.user.count({ where: COACH_WHERE }),
      this.prisma.user.count({ where: { ...COACH_WHERE, isActive: true } }),
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

    // O DTO já valida 0–50; defesa em profundidade contra NaN/valores fora da faixa
    const fee = Number(platformFeePercent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 50) {
      throw new BadRequestException('A taxa da plataforma deve ser um número entre 0 e 50');
    }

    // Upsert coach profile with the fee
    await this.prisma.coachProfile.upsert({
      where: { userId: coachId },
      create: { userId: coachId, maxAthletes: 30, platformFeePercent: fee },
      update: { platformFeePercent: fee },
    });

    return { success: true, coachId, platformFeePercent: fee };
  }

  async setUserActiveStatus(userId: string, isActive: boolean, actor?: AdminActor) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanManage(user, actor);
    await this.prisma.user.update({
      where: { id: userId },
      data: isActive ? { isActive } : { isActive, tokenVersion: { increment: 1 } },
    });
    return { success: true, userId, isActive };
  }
}
