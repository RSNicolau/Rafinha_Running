import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformPlanType, CoachSubscriptionStatus, WhiteLabelStatus, UserRole } from '@prisma/client';
import { CheckoutService } from '../payments/checkout/checkout.service';
import { SubscribePlatformDto, WhiteLabelDto } from './dto/platform.dto';
import {
  confirmDomainVerification, defaultTxtResolver, isUniqueViolation, normalizeDomain, requestDomainVerification, TxtResolver,
} from '../branding/domain-verification';

export { PLATFORM_PLANS } from './platform-plans';
import { PLATFORM_PLANS, ensureMissingPlatformPlans } from './platform-plans';

/** Dias do período de teste implícito (sem CoachSubscription). Decisão de produto pendente — configurável. */
export const TRIAL_DAYS = Math.max(0, Number(process.env.PLATFORM_TRIAL_DAYS ?? 14) || 0);
/** Limite de atletas do teste (mesmo de enforceAthleteLimit). */
export const TRIAL_MAX_ATHLETES = 5;

@Injectable()
export class PlatformService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private prisma: PrismaService,
    private checkout: CheckoutService,
  ) {}

  // ─── Seed plans ────────────────────────────────────────────────────────────

  /** A2: na subida da API, cria os planos da plataforma se a tabela estiver vazia (idempotente). */
  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' && process.env.SEED_PLANS_ON_BOOT === 'false') return;
    await this.ensurePlansSeeded().catch((e) => this.logger.warn(`Seed de planos da plataforma falhou: ${e?.message ?? e}`));
  }

  /** Cria os planos de PLATFORM_PLANS que faltam (qualquer tipo ausente; não sobrescreve preços editados). Retorna quantos criou. */
  async ensurePlansSeeded(): Promise<number> {
    const created = await ensureMissingPlatformPlans(this.prisma);
    if (created) this.logger.log(`Planos da plataforma criados: ${created}`);
    return created;
  }

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
      // Sem assinatura = período de teste implícito (até TRIAL_MAX_ATHLETES atletas; sem bloqueio do painel)
      const user = await this.prisma.user.findUnique({ where: { id: coachId }, select: { createdAt: true } }).catch(() => null);
      const start = user?.createdAt ? new Date(user.createdAt) : new Date();
      const endsAt = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return {
        status: 'NONE',
        plan: null,
        athleteCount: await this.getAthleteCount(coachId),
        trial: { implicit: true, maxAthletes: TRIAL_MAX_ATHLETES, trialEndsAt: endsAt, daysLeft, expired: daysLeft <= 0 },
      };
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

  /**
   * Assinatura de plano pelo coach. Plano pago NUNCA ativa sem pagamento:
   * cria uma cobrança PLATFORM_PLAN e a assinatura atual (ou o trial implícito) segue
   * inalterada até o pagamento ser confirmado (CheckoutService.markPaid → ACTIVE).
   * Plano com preço 0 (se existir) ativa direto.
   */
  async subscribe(
    coach: { id: string; name?: string | null; email?: string | null },
    dto: SubscribePlatformDto,
  ) {
    const plan = await this.prisma.platformPlan.findUnique({ where: { type: dto.plan } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plano não encontrado');

    if (plan.priceInCents <= 0) {
      const sub = await this.activatePlan(coach.id, dto.plan, CoachSubscriptionStatus.ACTIVE);
      return { status: 'ACTIVE', subscription: sub, checkout: null };
    }

    if (!dto.cpf) throw new BadRequestException('Informe o CPF/CNPJ para gerar a cobrança');
    const user = await this.prisma.user.findUnique({ where: { id: coach.id }, select: { name: true, email: true, phone: true } });
    const checkout = await this.checkout.createCheckout({
      purpose: 'PLATFORM_PLAN',
      refId: dto.plan,
      userId: coach.id,
      provider: dto.provider,
      method: dto.method,
      buyer: {
        name: dto.name || user?.name || coach.name || '',
        email: dto.email || user?.email || coach.email || '',
        cpf: dto.cpf,
        phone: dto.phone || user?.phone || null,
      },
    });
    const current = await this.prisma.coachSubscription.findUnique({ where: { coachId: coach.id }, include: { plan: true } });
    return { status: 'PENDING_PAYMENT', currentSubscription: current, checkout };
  }

  /** Ativação direta (uso administrativo / plano gratuito). */
  async activatePlan(coachId: string, planType: PlatformPlanType, status: CoachSubscriptionStatus) {
    const plan = await this.prisma.platformPlan.findUnique({ where: { type: planType } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.coachSubscription.upsert({
      where: { coachId },
      create: { coachId, planId: plan.id, status, currentPeriodStart: now, currentPeriodEnd: periodEnd },
      update: { planId: plan.id, status, currentPeriodStart: now, currentPeriodEnd: periodEnd },
      include: { plan: true },
    });
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
    return this.activatePlan(coachId, planType, status);
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

  private async activeWhiteLabelOwner(ownerId: string) {
    const sub = await this.prisma.coachSubscription.findUnique({
      where: { coachId: ownerId },
      include: { plan: true },
    });
    if (sub?.plan.type !== PlatformPlanType.WHITE_LABEL || sub.status !== CoachSubscriptionStatus.ACTIVE) {
      throw new ForbiddenException('Apenas assinantes ativos do plano White Label podem gerenciar contas white-label.');
    }
    return sub;
  }

  /** Resolver de TXT (substituível em testes). */
  txtResolver: TxtResolver = defaultTxtResolver;

  /**
   * A7: o domínio próprio NÃO é ativado direto — fica pendente até o TXT `_rr-verify.<domínio>` conferir
   * (POST /platform/white-label/domain/verify). Domínio vazio remove o atual.
   */
  async createWhiteLabel(ownerId: string, data: WhiteLabelDto) {
    const sub = await this.activeWhiteLabelOwner(ownerId);
    const requested = normalizeDomain(data.customDomain);
    const current = await this.prisma.whiteLabelAccount.findUnique({ where: { ownerId }, select: { id: true, customDomain: true } });
    const brand: Record<string, any> = {
      brandName: data.brandName,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor || null,
      ...(requested ? {} : { customDomain: null }),
    };
    // maxCoaches vem do plano (nunca do cliente); status/ownerId não são editáveis aqui
    const account = await this.prisma.whiteLabelAccount.upsert({
      where: { ownerId },
      create: { ownerId, ...brand, customDomain: null, maxCoaches: sub.plan.maxCoaches ?? 10 } as any,
      update: brand,
    });
    if (requested && requested !== current?.customDomain) {
      const pendingDomain = await requestDomainVerification(this.prisma, account.id, 'white-label', requested);
      return { ...account, pendingDomain };
    }
    return account;
  }

  async verifyWhiteLabelDomain(ownerId: string) {
    const account = await this.prisma.whiteLabelAccount.findUnique({ where: { ownerId } });
    if (!account) throw new NotFoundException('Conta white-label não encontrada');
    const domain = await confirmDomainVerification(this.prisma, account.id, this.txtResolver);
    await this.prisma.whiteLabelAccount.updateMany({ where: { customDomain: domain, id: { not: account.id } }, data: { customDomain: null } });
    try {
      const updated = await this.prisma.whiteLabelAccount.update({ where: { id: account.id }, data: { customDomain: domain } });
      return { ...updated, pendingDomain: null, verified: true };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Este domínio já está em uso por outra conta');
      throw e;
    }
  }

  // ─── White-label: add coach under WL account ───────────────────────────────

  /**
   * Só adiciona coaches sem assinatura ativa (ou já desta conta WL).
   * Um coach que paga o próprio plano ou pertence a outro WL → 409 (não pode ser "sequestrado").
   */
  async whiteLabelAddCoach(ownerId: string, coachId: string) {
    await this.activeWhiteLabelOwner(ownerId);
    const wl = await this.prisma.whiteLabelAccount.findUnique({ where: { ownerId } });
    if (!wl) throw new NotFoundException('Conta white-label não encontrada');
    if (wl.status !== WhiteLabelStatus.ACTIVE) throw new ForbiddenException('Conta white-label suspensa');
    if (coachId === ownerId) throw new BadRequestException('O dono da conta white-label não pode ser adicionado como coach gerenciado');

    const target = await this.prisma.user.findUnique({ where: { id: coachId }, select: { id: true, role: true, deletedAt: true } });
    if (!target || target.deletedAt || target.role !== UserRole.COACH) throw new NotFoundException('Coach não encontrado');

    const existing = await this.prisma.coachSubscription.findUnique({ where: { coachId } });
    const alreadyMine = existing?.whiteLabelId === wl.id;
    const unsubscribed = !existing || existing.status === CoachSubscriptionStatus.CANCELED;
    if (!alreadyMine && !unsubscribed) {
      throw new ConflictException('Este coach já possui uma assinatura ativa ou pertence a outra conta. Ele precisa cancelar antes de entrar no seu white-label.');
    }

    if (!alreadyMine) {
      const currentCount = await this.prisma.coachSubscription.count({ where: { whiteLabelId: wl.id } });
      if (currentCount >= wl.maxCoaches) {
        throw new ForbiddenException(`Limite de ${wl.maxCoaches} coaches atingido no seu plano White Label.`);
      }
    }

    // Coach gerenciado recebe plano PRO vinculado ao WL
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
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
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
