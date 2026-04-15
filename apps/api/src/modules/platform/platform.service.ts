import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformPlanType, CoachSubscriptionStatus, WhiteLabelStatus } from '@prisma/client';

// ─── Plan definitions (source of truth) ───────────────────────────────────────

export const PLATFORM_PLANS = [
  {
    type: PlatformPlanType.STARTER,
    name: 'Starter',
    description: 'Perfeito para coaches iniciando sua assessoria.',
    priceInCents: 19700,
    maxAthletes: 30,
    maxCoaches: null,
    features: [
      'Até 30 atletas',
      'Questionário de anamnese',
      'Planos de treino',
      'App para atletas',
      'Loja virtual',
    ],
  },
  {
    type: PlatformPlanType.PRO,
    name: 'Pro',
    description: 'Para assessorias em crescimento com equipe estruturada.',
    priceInCents: 39700,
    maxAthletes: 100,
    maxCoaches: null,
    features: [
      'Até 100 atletas',
      'Tudo do Starter',
      'Coach Brain IA',
      'Gestão de eventos',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
  },
  {
    type: PlatformPlanType.SCALE,
    name: 'Scale',
    description: 'Para times consolidados com grande base de atletas.',
    priceInCents: 69700,
    maxAthletes: 300,
    maxCoaches: null,
    features: [
      'Até 300 atletas',
      'Tudo do Pro',
      'Múltiplos coaches',
      'Dashboard analítico',
      'API access',
    ],
  },
  {
    type: PlatformPlanType.ELITE,
    name: 'Elite',
    description: 'Sem limites para as maiores assessorias do Brasil.',
    priceInCents: 99700,
    maxAthletes: null,
    maxCoaches: null,
    features: [
      'Atletas ilimitados',
      'Tudo do Scale',
      'SLA garantido',
      'Onboarding dedicado',
      'Integração Garmin/Strava',
    ],
  },
  {
    type: PlatformPlanType.WHITE_LABEL,
    name: 'White Label',
    description: 'Venda o app com sua própria marca para outros coaches.',
    priceInCents: 149700,
    maxAthletes: null,
    maxCoaches: 10,
    features: [
      'Atletas ilimitados',
      'Tudo do Elite',
      'Domínio próprio',
      'Sua marca (logo, cores)',
      'Gerenciar até 10 coaches',
      'Coaches pagam licença para você',
      'Suporte White Glove',
    ],
  },
];

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

  // ─── Seed plans ────────────────────────────────────────────────────────────

  async seedPlans() {
    for (const plan of PLATFORM_PLANS) {
      await this.prisma.platformPlan.upsert({
        where: { type: plan.type },
        create: { ...plan, features: plan.features },
        update: {
          name: plan.name,
          description: plan.description,
          priceInCents: plan.priceInCents,
          maxAthletes: plan.maxAthletes,
          maxCoaches: plan.maxCoaches,
          features: plan.features,
        },
      });
    }
  }

  // ─── List available plans (public) ─────────────────────────────────────────

  async listPlans() {
    const plans = await this.prisma.platformPlan.findMany({
      where: { isActive: true },
      orderBy: { priceInCents: 'asc' },
    });
    return plans;
  }

  // ─── Get coach's current subscription ──────────────────────────────────────

  async getMySubscription(coachId: string) {
    const sub = await this.prisma.coachSubscription.findUnique({
      where: { coachId },
      include: { plan: true },
    });

    if (!sub) {
      // Return "no plan" state
      return { status: 'NONE', plan: null, athleteCount: await this.getAthleteCount(coachId) };
    }

    const athleteCount = await this.getAthleteCount(coachId);
    const isOverLimit = sub.plan.maxAthletes !== null && athleteCount > sub.plan.maxAthletes;

    return {
      ...sub,
      athleteCount,
      isOverLimit,
      percentUsed: sub.plan.maxAthletes ? Math.round((athleteCount / sub.plan.maxAthletes) * 100) : 0,
    };
  }

  // ─── Subscribe coach to a plan ─────────────────────────────────────────────

  async subscribe(coachId: string, planType: PlatformPlanType) {
    const plan = await this.prisma.platformPlan.findUnique({ where: { type: planType } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sub = await this.prisma.coachSubscription.upsert({
      where: { coachId },
      create: {
        coachId,
        planId: plan.id,
        status: CoachSubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: plan.id,
        status: CoachSubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      include: { plan: true },
    });

    return sub;
  }

  // ─── Check athlete limit before creating athlete ────────────────────────────

  async enforceAthleteLimit(coachId: string) {
    const sub = await this.prisma.coachSubscription.findUnique({
      where: { coachId },
      include: { plan: true },
    });

    // No subscription → allow up to 5 (free trial)
    const limit = sub?.plan.maxAthletes ?? 5;
    const count = await this.getAthleteCount(coachId);

    if (count >= limit) {
      const planName = sub?.plan.name ?? 'Trial';
      throw new ForbiddenException(
        `Limite de atletas atingido (${count}/${limit}) no plano ${planName}. Faça upgrade para continuar.`,
      );
    }
  }

  // ─── Admin: list all subscriptions ─────────────────────────────────────────

  async listAllSubscriptions() {
    return this.prisma.coachSubscription.findMany({
      include: {
        plan: true,
        coach: { select: { id: true, name: true, email: true } },
        whiteLabel: { select: { id: true, brandName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Admin: manually set a coach's plan ────────────────────────────────────

  async adminSetPlan(coachId: string, planType: PlatformPlanType, status: CoachSubscriptionStatus) {
    return this.subscribe(coachId, planType).then(sub =>
      this.prisma.coachSubscription.update({
        where: { coachId },
        data: { status },
        include: { plan: true },
      }),
    );
  }

  // ─── Revenue overview (admin) ───────────────────────────────────────────────

  async getRevenueOverview() {
    const subs = await this.prisma.coachSubscription.findMany({
      where: { status: CoachSubscriptionStatus.ACTIVE },
      include: { plan: true },
    });

    const mrr = subs.reduce((sum, s) => sum + s.plan.priceInCents, 0);
    const byPlan = PLATFORM_PLANS.map(p => ({
      plan: p.name,
      count: subs.filter(s => s.plan.type === p.type).length,
      mrr: subs.filter(s => s.plan.type === p.type).reduce((sum, s) => sum + s.plan.priceInCents, 0),
    }));

    return {
      activeSubscriptions: subs.length,
      mrrInCents: mrr,
      mrrFormatted: `R$${(mrr / 100).toFixed(2).replace('.', ',')}`,
      arrInCents: mrr * 12,
      byPlan,
    };
  }

  // ─── White-label: create account ───────────────────────────────────────────

  async createWhiteLabel(ownerId: string, data: {
    brandName: string;
    customDomain?: string;
    logoUrl?: string;
    primaryColor?: string;
    maxCoaches?: number;
  }) {
    // Owner must have WHITE_LABEL subscription
    const sub = await this.prisma.coachSubscription.findUnique({
      where: { coachId: ownerId },
      include: { plan: true },
    });
    if (sub?.plan.type !== PlatformPlanType.WHITE_LABEL) {
      throw new ForbiddenException('Apenas assinantes do plano White Label podem criar contas white-label.');
    }

    return this.prisma.whiteLabelAccount.upsert({
      where: { ownerId },
      create: { ownerId, ...data, maxCoaches: data.maxCoaches ?? 10 },
      update: data,
    });
  }

  // ─── White-label: add coach under WL account ───────────────────────────────

  async whiteLabelAddCoach(ownerId: string, coachId: string) {
    const wl = await this.prisma.whiteLabelAccount.findUnique({ where: { ownerId } });
    if (!wl) throw new NotFoundException('Conta white-label não encontrada');
    if (wl.status !== WhiteLabelStatus.ACTIVE) throw new ForbiddenException('Conta white-label suspensa');

    const currentCount = await this.prisma.coachSubscription.count({ where: { whiteLabelId: wl.id } });
    if (currentCount >= wl.maxCoaches) {
      throw new ForbiddenException(`Limite de ${wl.maxCoaches} coaches atingido no seu plano White Label.`);
    }

    // Give the coach a PRO plan managed by WL
    const proPlan = await this.prisma.platformPlan.findUnique({ where: { type: PlatformPlanType.PRO } });
    if (!proPlan) throw new NotFoundException('Plano PRO não encontrado');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.coachSubscription.upsert({
      where: { coachId },
      create: {
        coachId,
        planId: proPlan.id,
        whiteLabelId: wl.id,
        status: CoachSubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: proPlan.id,
        whiteLabelId: wl.id,
        status: CoachSubscriptionStatus.ACTIVE,
      },
      include: { plan: true },
    });
  }

  // ─── White-label: list managed coaches ─────────────────────────────────────

  async whiteLabelListCoaches(ownerId: string) {
    const wl = await this.prisma.whiteLabelAccount.findUnique({ where: { ownerId } });
    if (!wl) throw new NotFoundException('Conta white-label não encontrada');

    return this.prisma.coachSubscription.findMany({
      where: { whiteLabelId: wl.id },
      include: {
        coach: { select: { id: true, name: true, email: true, createdAt: true } },
        plan: true,
      },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getAthleteCount(coachId: string): Promise<number> {
    return this.prisma.athleteProfile.count({ where: { coachId } });
  }
}
