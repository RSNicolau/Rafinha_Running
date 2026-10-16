import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MembershipStatus, PaymentProvider, PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AsaasService, AsaasBillingType, AsaasPayment } from '../payments/asaas/asaas.service';
import {
  CheckoutBuyer,
  CheckoutService,
  MembershipForBilling,
  derivedPaymentToken,
  fakeProviderAllowed,
  saoPauloDate,
  sha256,
  validateCheckoutBuyer,
} from '../payments/checkout/checkout.service';
import { firstMembershipDiscountCents } from '../referrals/referrals.service';
import { MIN_CHARGE_AFTER_CREDIT_CENTS, planCredit, releaseCredit, reserveCredit } from '../referrals/referral-credit';
import {
  addMonths,
  asaasCycle,
  buildTeamSplit,
  intervalMonths,
  dateFromAsaas,
  isBeyondGrace,
  monthlyEquivalentCents,
  toAsaasDate,
} from '../payments/checkout/membership.util';
import { AuthUserLike } from '../../common/utils/ownership';
import { MANAGER_ROLES, ResolvedTeam, TeamContextResolver } from './team-context.resolver';
import { ListTeamMembershipsQuery, MarkPaidOfflineDto, MembershipBillingType, SubscribeMembershipDto } from './dto/memberships.dto';

const DAY_MS = 86_400_000;
const REMIND_INTERVAL_MS = DAY_MS;
const OPEN_STATUSES: MembershipStatus[] = [MembershipStatus.PENDING, MembershipStatus.ACTIVE, MembershipStatus.PAST_DUE, MembershipStatus.PAUSED];
const REVIEW_FLAGS = new Set(['AMOUNT_MISMATCH', 'REFERENCE_MISMATCH', 'CHARGEBACK', 'NEEDS_REFUND']);

type MembershipRow = Prisma.AthleteMembershipGetPayload<{ include: { plan: true; team: true } }>;

export interface MembershipCheckout {
  membershipId: string;
  membershipStatus: MembershipStatus;
  paymentId: string | null;
  accessToken: string | null;
  provider: PaymentProvider;
  method: string;
  amountInCents: number;
  status: PaymentStatus | null;
  checkoutUrl: string | null;
  pix: { qrCodeBase64: string | null; copyPaste: string; expiresAt: string | null } | null;
  dueDate: string | null;
  /** Caminho da tela de pagamento já existente (/pedido/[paymentId]) */
  payPath: string | null;
  /** Desconto de indicação aplicado na 1ª cobrança (centavos; 0 quando não houve). */
  referralDiscountCents?: number;
  /** Valor cheio da mensalidade (as próximas cobranças). */
  fullPriceInCents?: number;
  /** Crédito de indicação (saldo) abatido da 1ª cobrança (centavos). */
  creditAppliedCents?: number;
}

/** Meia-noite (SP) de hoje + `offsetDays`. Todas as datas de vencimento são normalizadas assim. */
export function spMidnight(now = new Date(), offsetDays = 0): Date {
  return dateFromAsaas(saoPauloDate(offsetDays, now))!;
}

/** Acesso efetivo da mensalidade (sem bloquear treino — só informa a UI). */
export function membershipAccess(
  m: { status: MembershipStatus; currentPeriodEnd: Date | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!m) return false;
  if (m.status === MembershipStatus.ACTIVE) return true;
  if (m.status === MembershipStatus.CANCELED || m.status === MembershipStatus.PAUSED) {
    return !!m.currentPeriodEnd && m.currentPeriodEnd.getTime() > now.getTime();
  }
  return false;
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutraliza fórmula (CSV injection)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const INTERVAL_LABEL: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando 1º pagamento',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Inadimplente',
  PAUSED: 'Pausada',
  CANCELED: 'Cancelada',
};

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);
  private readonly lastReconcile = new Map<string, number>();
  private lastJobReconcileAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly checkout: CheckoutService,
    private readonly teams: TeamContextResolver,
    private readonly email: EmailService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  // Provedor
  // ════════════════════════════════════════════════════════════════════════

  /** Mensalidade recorrente: Asaas (assinatura) ou FAKE em dev/test. Stripe não faz recorrência aqui. */
  selectProvider(): PaymentProvider {
    if (this.asaas.isConfigured) return PaymentProvider.ASAAS;
    if (fakeProviderAllowed()) return PaymentProvider.FAKE;
    throw new ServiceUnavailableException('Cobrança recorrente indisponível no momento (gateway não configurado)');
  }

  private methods() {
    let provider: PaymentProvider | null = null;
    try {
      provider = this.selectProvider();
    } catch {
      provider = null;
    }
    return {
      provider,
      pix: !!provider,
      boleto: provider === PaymentProvider.ASAAS,
      creditCard: provider === PaymentProvider.ASAAS,
      fake: provider === PaymentProvider.FAKE,
    };
  }

  private appUrl(): string {
    return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
  }

  // ════════════════════════════════════════════════════════════════════════
  // Atleta
  // ════════════════════════════════════════════════════════════════════════

  /** Mensalidade vigente do atleta: a mais recente não cancelada; senão a última cancelada. */
  private async currentMembership(athleteId: string): Promise<MembershipRow | null> {
    const open = await this.prisma.athleteMembership.findFirst({
      where: { athleteId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, team: true },
    });
    if (open) return open;
    return this.prisma.athleteMembership.findFirst({
      where: { athleteId },
      orderBy: { updatedAt: 'desc' },
      include: { plan: true, team: true },
    });
  }

  /** O atleta tem mensalidade vigente (ou assinatura legada ativa)? Não bloqueia nada — só informa. */
  async isActive(athleteId: string, now = new Date()): Promise<boolean> {
    const memberships = await this.prisma.athleteMembership.findMany({
      where: { athleteId, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.CANCELED, MembershipStatus.PAUSED] } },
      select: { status: true, currentPeriodEnd: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    if (memberships.some((m) => membershipAccess(m, now))) return true;
    const legacy = await this.prisma.subscription.findFirst({
      where: { userId: athleteId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
      select: { id: true },
    });
    return !!legacy;
  }

  async getMine(userId: string) {
    const now = new Date();
    const team = await this.teams.teamForAthlete(userId);
    let membership = await this.currentMembership(userId);

    // Rede local / sem webhook: reconcilia a mensalidade em aberto com o gateway (throttle 15 s)
    if (membership && membership.provider === PaymentProvider.ASAAS && membership.externalSubscriptionId) {
      const st = membership.status as MembershipStatus;
      if (st === MembershipStatus.PENDING || st === MembershipStatus.PAST_DUE) {
        const last = this.lastReconcile.get(membership.id) ?? 0;
        if (Date.now() - last > 15_000) {
          this.lastReconcile.set(membership.id, Date.now());
          if (this.lastReconcile.size > 2000) this.lastReconcile.clear();
          await this.reconcileMembership(membership).catch((e) => this.logger.warn(`Reconciliação mensalidade ${membership!.id}: ${e?.message}`));
          membership = await this.currentMembership(userId);
        }
      }
    }

    const [plans, payments, legacy] = await Promise.all([
      team
        ? this.prisma.teamPlan.findMany({
            where: { teamId: team.id, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { priceInCents: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.payment.findMany({
        where: { userId, purpose: PaymentPurpose.MEMBERSHIP, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 24,
      }),
      membership
        ? Promise.resolve(null)
        : this.prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const mPayments = membership ? payments.filter((p) => p.membershipId === membership!.id) : [];
    const open = mPayments.find((p) => p.status === PaymentStatus.PENDING) ?? null;
    const hasAccess = membershipAccess(membership, now);
    const openOverdue = !!open && (open.failureReason === 'OVERDUE' || (!!open.expiresAt && open.expiresAt.getTime() + DAY_MS <= now.getTime()));
    let banner: 'PAST_DUE' | 'IN_GRACE' | 'PENDING' | 'CANCELED' | null = null;
    if (membership?.status === MembershipStatus.PAST_DUE) banner = 'PAST_DUE';
    else if (membership?.status === MembershipStatus.ACTIVE && openOverdue) banner = 'IN_GRACE';
    else if (membership?.status === MembershipStatus.PENDING) banner = 'PENDING';
    else if (membership?.status === MembershipStatus.CANCELED && hasAccess) banner = 'CANCELED';

    const legacyActive =
      !!legacy && ['ACTIVE', 'TRIALING'].includes(legacy.status) && legacy.currentPeriodEnd.getTime() > now.getTime();

    return {
      team: team ? { id: team.id, name: team.name, slug: team.slug, logoUrl: team.logoUrl } : null,
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            teamId: membership.teamId,
            plan: { id: membership.plan.id, name: membership.plan.name, interval: membership.plan.interval },
            priceInCents: membership.priceInCents,
            provider: membership.provider,
            currentPeriodStart: membership.currentPeriodStart,
            currentPeriodEnd: membership.currentPeriodEnd,
            nextDueDate: membership.nextDueDate,
            canceledAt: membership.canceledAt,
            cancelReason: membership.cancelReason,
            hasAccess,
            inGracePeriod: banner === 'IN_GRACE',
            openInvoice: open
              ? {
                  paymentId: open.id,
                  amountInCents: open.amount,
                  dueDate: open.expiresAt,
                  invoiceUrl: open.checkoutUrl,
                  payPath: `/pedido/${open.id}`,
                  overdue: openOverdue,
                }
              : null,
          }
        : null,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        interval: p.interval,
        priceInCents: p.priceInCents,
        monthlyEquivalentInCents: monthlyEquivalentCents(p.priceInCents, p.interval),
        benefits: p.benefits,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        membershipId: p.membershipId,
        amountInCents: p.amount,
        status: p.status,
        method: p.method,
        dueDate: p.expiresAt,
        paidAt: p.paidAt,
        invoiceUrl: p.checkoutUrl,
        payPath: p.status === PaymentStatus.PENDING ? `/pedido/${p.id}` : null,
        createdAt: p.createdAt,
      })),
      legacySubscription: legacy
        ? {
            id: legacy.id,
            planType: legacy.planType,
            status: legacy.status,
            provider: legacy.provider,
            currentPeriodEnd: legacy.currentPeriodEnd,
            cancelAtPeriodEnd: legacy.cancelAtPeriodEnd,
          }
        : null,
      access: {
        active: hasAccess || legacyActive,
        banner,
        /** decisão de produto pendente: treino NÃO é bloqueado automaticamente */
        blocksTraining: false,
      },
      methods: this.methods(),
    };
  }

  /** Equipe do atleta (perfil; fallback: equipe do treinador) — usado também pelo checkout do onboarding. */
  async teamForAthlete(athleteId: string) {
    return this.teams.teamForAthlete(athleteId);
  }

  async subscribe(user: { id: string }, dto: SubscribeMembershipDto): Promise<MembershipCheckout> {
    const buyer = validateCheckoutBuyer(dto.buyer as CheckoutBuyer);
    const team = await this.teams.teamForAthlete(user.id);
    if (!team) throw new NotFoundException('Você ainda não faz parte de uma equipe');
    const plan = await this.prisma.teamPlan.findFirst({ where: { id: dto.planId, teamId: team.id, isActive: true } });
    if (!plan) throw new NotFoundException('Plano não encontrado na sua equipe');
    if (plan.priceInCents <= 0) throw new BadRequestException('Plano sem valor de cobrança');

    const provider = this.selectProvider();
    const billingType: MembershipBillingType = provider === PaymentProvider.FAKE ? 'PIX' : dto.billingType ?? 'PIX';
    const now = new Date();

    const existing = await this.prisma.athleteMembership.findFirst({
      where: { athleteId: user.id, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, team: true },
    });

    if (existing && existing.teamId === team.id) {
      if (existing.status === MembershipStatus.ACTIVE) {
        if (existing.planId === plan.id) throw new ConflictException('Você já tem esta mensalidade ativa');
        throw new ConflictException('Você já tem uma mensalidade ativa — use "Trocar plano"');
      }
      if (existing.status === MembershipStatus.PENDING && existing.planId === plan.id) {
        // clique duplo / voltar à tela: devolve a mesma cobrança (mesmo token)
        const open = await this.prisma.payment.findFirst({
          where: {
            membershipId: existing.id,
            status: PaymentStatus.PENDING,
            method: billingType,
            externalPaymentId: { not: null },
            createdAt: { gte: new Date(now.getTime() - 25 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
        });
        const tok = open ? derivedPaymentToken(open.id) : null;
        if (open && tok && open.accessTokenHash === sha256(tok)) return this.toCheckout(existing, open, tok);
      }
    } else if (existing && existing.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('Você tem uma mensalidade ativa com outra equipe — cancele-a antes de assinar');
    } else if (existing) {
      // mensalidade não ativa de outra equipe (troca de assessoria): encerra antes
      await this.stopGateway(existing);
      await this.closeOpenPayments(existing.id, 'TEAM_CHANGED');
      await this.prisma.athleteMembership.update({
        where: { id: existing.id },
        data: { status: MembershipStatus.CANCELED, canceledAt: now, cancelReason: 'Troca de equipe', nextDueDate: null },
      });
    }

    let membership: MembershipRow;
    let created = false;
    if (existing && existing.teamId === team.id) {
      // reaproveita a linha (PENDING/PAST_DUE/PAUSED): encerra a assinatura anterior e recomeça hoje
      await this.stopGateway(existing);
      await this.closeOpenPayments(existing.id, 'REPLACED');
      membership = await this.prisma.athleteMembership.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          priceInCents: plan.priceInCents,
          provider,
          status: existing.status === MembershipStatus.PAST_DUE ? MembershipStatus.PAST_DUE : MembershipStatus.PENDING,
          externalSubscriptionId: null,
          canceledAt: null,
          cancelReason: null,
        },
        include: { plan: true, team: true },
      });
    } else {
      membership = await this.prisma.athleteMembership.create({
        data: {
          teamId: team.id,
          athleteId: user.id,
          planId: plan.id,
          status: MembershipStatus.PENDING,
          provider,
          priceInCents: plan.priceInCents,
        },
        include: { plan: true, team: true },
      });
      created = true;
    }

    // Indicação: R$30 de desconto só na 1ª mensalidade do indicado (nunca pagou mensalidade antes)
    const discountCents = await firstMembershipDiscountCents(this.prisma, user.id, plan.priceInCents).catch(() => 0);
    // Saldo de crédito de indicação (ex.: R$50 do indicador): abatido da 1ª cobrança, mínimo R$5.
    // Reservado na cobrança; consumido só quando o pagamento é confirmado (markPaid); falha/expiração devolve.
    const creditCents =
      (dto as any).useCredit === false
        ? 0
        : (await planCredit(this.prisma, user.id, `MEMBERSHIP:${membership.id}`, plan.priceInCents - Math.max(0, discountCents)).catch(() => ({ cents: 0 }))).cents;

    try {
      const started = await this.startBilling(membership, team, { buyer, billingType, firstDue: spMidnight(now), discountCents, creditCents });
      return {
        ...this.toCheckout(started.membership, started.payment, started.token),
        referralDiscountCents: started.discountCents,
        creditAppliedCents: started.creditCents,
        fullPriceInCents: membership.priceInCents,
      };
    } catch (err) {
      if (created) {
        await this.prisma.athleteMembership
          .update({
            where: { id: membership.id },
            data: { status: MembershipStatus.CANCELED, canceledAt: new Date(), cancelReason: 'GATEWAY_ERROR' },
          })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  async cancelMine(userId: string, reason?: string) {
    const m = await this.prisma.athleteMembership.findFirst({
      where: { athleteId: userId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, team: true },
    });
    if (!m) throw new NotFoundException('Nenhuma mensalidade em andamento');
    return this.cancelMembership(m, reason?.trim() || 'Cancelada pelo atleta');
  }

  async changePlan(userId: string, planId: string) {
    const m = await this.prisma.athleteMembership.findFirst({
      where: { athleteId: userId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, team: true },
    });
    if (!m) throw new NotFoundException('Nenhuma mensalidade em andamento');
    if (m.status !== MembershipStatus.ACTIVE && m.status !== MembershipStatus.PAST_DUE) {
      throw new ConflictException('A troca de plano vale para mensalidades ativas — para mudar agora, assine o novo plano');
    }
    if (m.planId === planId) throw new ConflictException('Este já é o seu plano');
    const plan = await this.prisma.teamPlan.findFirst({ where: { id: planId, teamId: m.teamId, isActive: true } });
    if (!plan) throw new NotFoundException('Plano não encontrado na sua equipe');
    if (plan.priceInCents <= 0) throw new BadRequestException('Plano sem valor de cobrança');

    if (m.provider === PaymentProvider.ASAAS && m.externalSubscriptionId) {
      // vale a partir do próximo ciclo: atualiza valor/ciclo e as cobranças ainda não pagas (próximo ciclo)
      await this.asaas.updateSubscription(m.externalSubscriptionId, {
        valueInCents: plan.priceInCents,
        cycle: asaasCycle(plan.interval),
        description: `${plan.name} — ${m.team.name}`,
        updatePendingPayments: true,
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.athleteMembership.update({
        where: { id: m.id },
        data: { planId: plan.id, priceInCents: plan.priceInCents },
        include: { plan: true, team: true },
      });
      // cobranças em aberto acompanham o novo valor (mesmo efeito de updatePendingPayments no Asaas)
      await tx.payment.updateMany({
        where: { membershipId: m.id, status: PaymentStatus.PENDING, failureReason: null },
        data: { amount: plan.priceInCents },
      });
      return u;
    });
    return {
      id: updated.id,
      status: updated.status,
      plan: { id: updated.plan.id, name: updated.plan.name, interval: updated.plan.interval },
      priceInCents: updated.priceInCents,
      effectiveFrom: updated.nextDueDate,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Gestão pela equipe (OWNER/ADMIN/STAFF)
  // ════════════════════════════════════════════════════════════════════════

  private teamWhere(teamId: string, q: Partial<ListTeamMembershipsQuery>): Prisma.AthleteMembershipWhereInput {
    const athlete: Prisma.UserWhereInput = {};
    const and: Prisma.UserWhereInput[] = [];
    const search = q.search?.trim();
    if (search) {
      and.push({ OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] });
    }
    if (q.coachId) and.push({ athleteProfile: { coachId: q.coachId } });
    if (and.length) athlete.AND = and;
    return {
      teamId,
      ...(q.status ? { status: q.status as MembershipStatus } : {}),
      ...(q.planId ? { planId: q.planId } : {}),
      ...(and.length ? { athlete } : {}),
    };
  }

  private async loadTeamItems(where: Prisma.AthleteMembershipWhereInput, skip: number, take: number) {
    const rows = await this.prisma.athleteMembership.findMany({
      where,
      orderBy: [{ nextDueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take,
      include: {
        plan: { select: { id: true, name: true, interval: true } },
        athlete: {
          select: {
            id: true,
            name: true,
            email: true,
            athleteProfile: { select: { coach: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    const ids = rows.map((r) => r.id);
    const payments = ids.length
      ? await this.prisma.payment.findMany({
          where: { membershipId: { in: ids }, purpose: PaymentPurpose.MEMBERSHIP },
          orderBy: { createdAt: 'desc' },
          select: { id: true, membershipId: true, amount: true, status: true, paidAt: true, expiresAt: true, checkoutUrl: true, failureReason: true },
        })
      : [];
    const byMembership = new Map<string, typeof payments>();
    for (const p of payments) {
      const list = byMembership.get(p.membershipId!) ?? [];
      list.push(p);
      byMembership.set(p.membershipId!, list);
    }
    const now = new Date();
    return rows.map((r) => {
      const ps = byMembership.get(r.id) ?? [];
      const lastPaid = ps.filter((p) => p.status === PaymentStatus.SUCCEEDED).sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))[0];
      const open = ps.find((p) => p.status === PaymentStatus.PENDING);
      const flags = new Set<string>();
      for (const p of ps) {
        if (p.failureReason && REVIEW_FLAGS.has(p.failureReason)) flags.add(p.failureReason);
        if (p.status === PaymentStatus.REFUNDED) flags.add('REFUNDED');
      }
      const inGrace =
        r.status === MembershipStatus.ACTIVE &&
        !!open &&
        (open.failureReason === 'OVERDUE' || (!!open.expiresAt && open.expiresAt.getTime() + DAY_MS <= now.getTime()));
      if (inGrace) flags.add('OVERDUE_IN_GRACE');
      return {
        id: r.id,
        status: r.status,
        athlete: { id: r.athlete.id, name: r.athlete.name, email: r.athlete.email },
        coach: r.athlete.athleteProfile?.coach ?? null,
        plan: r.plan,
        priceInCents: r.priceInCents,
        monthlyEquivalentInCents: monthlyEquivalentCents(r.priceInCents, r.plan.interval),
        provider: r.provider,
        nextDueDate: r.nextDueDate,
        currentPeriodStart: r.currentPeriodStart,
        currentPeriodEnd: r.currentPeriodEnd,
        canceledAt: r.canceledAt,
        cancelReason: r.cancelReason,
        createdAt: r.createdAt,
        hasAccess: membershipAccess(r, now),
        lastPayment: lastPaid ? { id: lastPaid.id, amountInCents: lastPaid.amount, paidAt: lastPaid.paidAt } : null,
        openInvoice: open
          ? { paymentId: open.id, amountInCents: open.amount, dueDate: open.expiresAt, invoiceUrl: open.checkoutUrl }
          : null,
        flags: [...flags],
      };
    });
  }

  async listTeam(user: AuthUserLike, q: ListTeamMembershipsQuery, req?: any) {
    const team = await this.teams.teamForManager(user, q.teamId, req);
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const where = this.teamWhere(team.id, q);
    const [total, items] = await Promise.all([
      this.prisma.athleteMembership.count({ where }),
      this.loadTeamItems(where, (page - 1) * limit, limit),
    ]);
    return { team: { id: team.id, name: team.name }, items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async summary(user: AuthUserLike, teamId?: string, req?: any, now = new Date()) {
    const team = await this.teams.teamForManager(user, teamId, req);
    return this.computeSummary(team, now);
  }

  async computeSummary(team: Pick<ResolvedTeam, 'id' | 'name'>, now = new Date()) {
    const todayStart = spMidnight(now);
    const monthStart = dateFromAsaas(`${saoPauloDate(0, now).slice(0, 7)}-01`)!;
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const [grouped, canceledLast30, active, received, overdue, upcoming, plansCount, withoutMembership] = await Promise.all([
      this.prisma.athleteMembership.groupBy({ by: ['status'], where: { teamId: team.id }, _count: { _all: true } }),
      this.prisma.athleteMembership.count({
        where: { teamId: team.id, status: MembershipStatus.CANCELED, canceledAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      }),
      this.prisma.athleteMembership.findMany({
        where: { teamId: team.id, status: MembershipStatus.ACTIVE },
        select: { priceInCents: true, plan: { select: { interval: true } } },
      }),
      this.prisma.payment.aggregate({
        where: { teamId: team.id, purpose: PaymentPurpose.MEMBERSHIP, status: PaymentStatus.SUCCEEDED, paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { teamId: team.id, purpose: PaymentPurpose.MEMBERSHIP, status: PaymentStatus.PENDING, expiresAt: { lt: todayStart } },
        _sum: { amount: true },
      }),
      this.prisma.athleteMembership.findMany({
        where: { teamId: team.id, status: MembershipStatus.ACTIVE, nextDueDate: { gte: todayStart, lte: in7 } },
        orderBy: { nextDueDate: 'asc' },
        take: 50,
        include: { athlete: { select: { id: true, name: true } }, plan: { select: { name: true } } },
      }),
      this.prisma.teamPlan.count({ where: { teamId: team.id, isActive: true } }),
      this.prisma.athleteProfile.count({
        where: {
          teamId: team.id,
          user: { deletedAt: null, athleteMemberships: { none: { teamId: team.id, status: { in: OPEN_STATUSES } } } },
        },
      }),
    ]);
    const count = (s: MembershipStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      team: { id: team.id, name: team.name },
      activeCount: count(MembershipStatus.ACTIVE),
      pastDueCount: count(MembershipStatus.PAST_DUE),
      pendingCount: count(MembershipStatus.PENDING),
      pausedCount: count(MembershipStatus.PAUSED),
      canceledLast30,
      mrrInCents: active.reduce((acc, m) => acc + monthlyEquivalentCents(m.priceInCents, m.plan.interval), 0),
      receivedThisMonthInCents: received._sum.amount ?? 0,
      overdueAmountInCents: overdue._sum.amount ?? 0,
      upcoming7Days: upcoming.map((m) => ({
        membershipId: m.id,
        athleteId: m.athlete.id,
        athleteName: m.athlete.name,
        planName: m.plan.name,
        amountInCents: m.priceInCents,
        dueDate: m.nextDueDate,
      })),
      plansCount,
      hasPlans: plansCount > 0,
      athletesWithoutMembership: withoutMembership,
    };
  }

  async exportCsv(user: AuthUserLike, q: ListTeamMembershipsQuery, req?: any): Promise<string> {
    const team = await this.teams.teamForManager(user, q.teamId, req);
    const items = await this.loadTeamItems(this.teamWhere(team.id, q), 0, 5000);
    const brl = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));
    const d = (v: Date | null | undefined) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
    const header = ['Atleta', 'E-mail', 'Treinador', 'Plano', 'Periodicidade', 'Valor (R$)', 'Status', 'Próximo vencimento', 'Período até', 'Último pagamento', 'Valor último pagamento (R$)', 'Em aberto (R$)', 'Alertas'];
    const lines = items.map((i) =>
      [
        i.athlete.name,
        i.athlete.email,
        i.coach?.name ?? '',
        i.plan.name,
        INTERVAL_LABEL[i.plan.interval] ?? i.plan.interval,
        brl(i.priceInCents),
        STATUS_LABEL[i.status] ?? i.status,
        d(i.nextDueDate),
        d(i.currentPeriodEnd),
        d(i.lastPayment?.paidAt),
        brl(i.lastPayment?.amountInCents),
        brl(i.openInvoice?.amountInCents),
        i.flags.join(' '),
      ]
        .map(csvCell)
        .join(';'),
    );
    return '﻿' + [header.map(csvCell).join(';'), ...lines].join('\r\n') + '\r\n';
  }

  private async teamMembership(user: AuthUserLike, id: string, teamId?: string, req?: any, roles?: readonly string[]) {
    const team = await this.teams.teamForManager(user, teamId, req, roles);
    const m = await this.prisma.athleteMembership.findFirst({ where: { id, teamId: team.id }, include: { plan: true, team: true } });
    if (!m) throw new NotFoundException('Mensalidade não encontrada');
    return m;
  }

  async teamCancel(user: AuthUserLike, id: string, reason?: string, teamId?: string, req?: any) {
    const m = await this.teamMembership(user, id, teamId, req);
    if (m.status === MembershipStatus.CANCELED) throw new ConflictException('Mensalidade já cancelada');
    return this.cancelMembership(m, reason?.trim() || 'Cancelada pela equipe');
  }

  async pause(user: AuthUserLike, id: string, teamId?: string, req?: any) {
    const m = await this.teamMembership(user, id, teamId, req);
    if (m.status === MembershipStatus.PAUSED) throw new ConflictException('Mensalidade já está pausada');
    if (m.status === MembershipStatus.CANCELED) throw new ConflictException('Mensalidade cancelada não pode ser pausada');
    await this.stopGateway(m);
    await this.closeOpenPayments(m.id, 'PAUSED');
    const u = await this.prisma.athleteMembership.update({
      where: { id: m.id },
      data: { status: MembershipStatus.PAUSED, nextDueDate: null },
    });
    return { id: u.id, status: u.status, accessUntil: u.currentPeriodEnd && u.currentPeriodEnd > new Date() ? u.currentPeriodEnd : null };
  }

  /** Retoma: nova assinatura no gateway; a 1ª cobrança vence no fim do período já pago (ou hoje). */
  async resume(user: AuthUserLike, id: string, teamId?: string, req?: any) {
    const m = await this.teamMembership(user, id, teamId, req);
    if (m.status !== MembershipStatus.PAUSED) throw new ConflictException('Somente mensalidades pausadas podem ser retomadas');
    const now = new Date();
    const stillPaid = !!m.currentPeriodEnd && m.currentPeriodEnd.getTime() > now.getTime();
    const firstDue = stillPaid ? spMidnightOf(m.currentPeriodEnd!) : spMidnight(now);
    const provider = this.selectProvider();
    const prepared = await this.prisma.athleteMembership.update({
      where: { id: m.id },
      data: { status: stillPaid ? MembershipStatus.ACTIVE : MembershipStatus.PENDING, provider },
      include: { plan: true, team: true },
    });
    try {
      const started = await this.startBilling(prepared, m.team, { billingType: 'UNDEFINED', firstDue });
      return this.toCheckout(started.membership, started.payment, started.token);
    } catch (err) {
      await this.prisma.athleteMembership.update({ where: { id: m.id }, data: { status: MembershipStatus.PAUSED } }).catch(() => undefined);
      throw err;
    }
  }

  async remind(user: AuthUserLike & { id: string }, id: string, teamId?: string, req?: any) {
    const m = await this.teamMembership(user, id, teamId, req);
    if (m.status === MembershipStatus.CANCELED || m.status === MembershipStatus.PAUSED) {
      throw new ConflictException('Mensalidade sem cobrança em andamento');
    }
    const now = new Date();
    const recent = await this.prisma.auditLog.findFirst({
      where: { action: 'MEMBERSHIP_REMINDER', entityType: 'AthleteMembership', entityId: m.id, createdAt: { gte: new Date(now.getTime() - REMIND_INTERVAL_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new HttpException(
        { statusCode: 429, message: 'Lembrete já enviado nas últimas 24 h', nextAllowedAt: new Date(recent.createdAt.getTime() + REMIND_INTERVAL_MS) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const open = await this.prisma.payment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (!open) throw new ConflictException('Nenhuma fatura em aberto para lembrar');
    const athlete = await this.prisma.user.findUnique({ where: { id: m.athleteId }, select: { email: true, name: true } });
    if (!athlete?.email) throw new ConflictException('Atleta sem e-mail cadastrado');

    // registra ANTES de enviar: dois cliques simultâneos não disparam dois e-mails em sequência
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'MEMBERSHIP_REMINDER', entityType: 'AthleteMembership', entityId: m.id, metadata: { paymentId: open.id } },
    });
    const invoiceUrl = open.checkoutUrl || `${this.appUrl()}/pedido/${open.id}`;
    await this.email.sendMembershipReminder(athlete.email, {
      name: athlete.name,
      teamName: m.team.name,
      planName: m.plan.name,
      amountInCents: open.amount,
      dueDate: open.expiresAt,
      invoiceUrl,
      overdue: !!open.expiresAt && open.expiresAt.getTime() + DAY_MS <= now.getTime(),
    });
    return { sent: true, paymentId: open.id, nextAllowedAt: new Date(now.getTime() + REMIND_INTERVAL_MS) };
  }

  /**
   * Pagamento recebido fora do app (dinheiro / Pix direto na conta da equipe) — só OWNER/ADMIN.
   * Cria Payment MANUAL e ativa pelo MESMO caminho do markPaid (período avança uma única vez).
   * A cobrança em aberto do mesmo ciclo é encerrada (e cancelada no gateway) para não ser paga em dobro.
   * Idempotência: repetir em até 2 min com o mesmo valor devolve o registro anterior.
   */
  async markPaidOffline(user: AuthUserLike & { id: string }, id: string, dto: MarkPaidOfflineDto, teamId?: string, req?: any) {
    const m = await this.teamMembership(user, id, teamId, req, MANAGER_ROLES);
    if (m.status === MembershipStatus.CANCELED || m.status === MembershipStatus.PAUSED) {
      throw new ConflictException('Mensalidade cancelada ou pausada — retome ou peça nova assinatura antes de registrar pagamento');
    }
    if (dto.amountInCents !== m.priceInCents) {
      throw new BadRequestException(`O valor deve ser igual ao da mensalidade (${(m.priceInCents / 100).toFixed(2).replace('.', ',')})`);
    }
    const now = new Date();
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : now;
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BadRequestException('Data do pagamento inválida');
    }
    if (paidAt.getTime() < now.getTime() - 400 * DAY_MS) throw new BadRequestException('Data do pagamento muito antiga');

    const recent = await this.prisma.payment.findFirst({
      where: {
        membershipId: m.id,
        provider: PaymentProvider.MANUAL,
        status: PaymentStatus.SUCCEEDED,
        amount: dto.amountInCents,
        createdAt: { gte: new Date(now.getTime() - 2 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return this.offlineResult(m.id, recent, false);

    const open = await this.prisma.payment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.PENDING },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    const due = open?.expiresAt ?? m.nextDueDate ?? spMidnight(now);

    const paymentId = randomUUID();
    await this.prisma.payment.create({
      data: {
        id: paymentId,
        userId: m.athleteId,
        purpose: PaymentPurpose.MEMBERSHIP,
        membershipId: m.id,
        teamId: m.teamId,
        amount: dto.amountInCents,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.MANUAL,
        method: 'OFFLINE',
        externalPaymentId: `manual_${paymentId}`,
        expiresAt: due,
      },
    });
    const r = await this.checkout.markPaid(paymentId, 'MANUAL');
    await this.prisma.payment.update({ where: { id: paymentId }, data: { paidAt } });

    if (open) {
      const closed = await this.prisma.payment.updateMany({
        where: { id: open.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, failureReason: 'PAID_OFFLINE' },
      });
      if (closed.count === 1 && open.provider === PaymentProvider.ASAAS && open.externalPaymentId && this.asaas.isConfigured) {
        await this.asaas.cancelPayment(open.externalPaymentId);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'MEMBERSHIP_PAID_OFFLINE',
        entityType: 'AthleteMembership',
        entityId: m.id,
        metadata: {
          paymentId,
          amountInCents: dto.amountInCents,
          paidAt: paidAt.toISOString(),
          note: dto.note?.trim().slice(0, 500) || null,
          closedPaymentId: open?.id ?? null,
          outcome: r.outcome ?? null,
        },
      },
    });
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return this.offlineResult(m.id, payment, true, r.outcome);
  }

  private async offlineResult(membershipId: string, payment: any, created: boolean, outcome?: string) {
    const m = await this.prisma.athleteMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, nextDueDate: true },
    });
    return {
      created,
      outcome: outcome ?? 'FULFILLED',
      payment: payment
        ? { id: payment.id, amountInCents: payment.amount, status: payment.status, provider: payment.provider, paidAt: payment.paidAt }
        : null,
      membership: m,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Jobs (scheduler)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Diário: mensalidade ACTIVE cujo vencimento + carência da equipe já passou e não foi paga
   * (pagar avança nextDueDate) → PAST_DUE + e-mail ao atleta + resumo ao dono da equipe.
   */
  async markPastDue(now = new Date()) {
    const candidates = await this.prisma.athleteMembership.findMany({
      where: { status: MembershipStatus.ACTIVE, nextDueDate: { lt: now } },
      include: {
        team: { select: { id: true, name: true, graceDays: true, owner: { select: { email: true, name: true } } } },
        athlete: { select: { email: true, name: true } },
        plan: { select: { name: true } },
      },
      take: 500,
    });
    const perTeam = new Map<string, { team: (typeof candidates)[number]['team']; athletes: Array<{ name: string; planName: string; amountInCents: number; dueDate: Date | null }> }>();
    let marked = 0;
    for (const m of candidates) {
      if (!m.nextDueDate || !isBeyondGrace(m.nextDueDate, m.team.graceDays, now)) continue;
      const upd = await this.prisma.athleteMembership.updateMany({
        where: { id: m.id, status: MembershipStatus.ACTIVE, nextDueDate: m.nextDueDate },
        data: { status: MembershipStatus.PAST_DUE },
      });
      if (upd.count !== 1) continue;
      marked++;
      const open = await this.prisma.payment.findFirst({
        where: { membershipId: m.id, status: PaymentStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
      if (m.athlete.email) {
        await this.email
          .sendMembershipPastDue(m.athlete.email, {
            name: m.athlete.name,
            teamName: m.team.name,
            planName: m.plan.name,
            amountInCents: open?.amount ?? m.priceInCents,
            dueDate: m.nextDueDate,
            invoiceUrl: open ? open.checkoutUrl || `${this.appUrl()}/pedido/${open.id}` : null,
          })
          .catch((e) => this.logger.warn(`E-mail de atraso ${m.id}: ${e?.message}`));
      }
      const entry = perTeam.get(m.teamId) ?? { team: m.team, athletes: [] };
      entry.athletes.push({ name: m.athlete.name, planName: m.plan.name, amountInCents: open?.amount ?? m.priceInCents, dueDate: m.nextDueDate });
      perTeam.set(m.teamId, entry);
    }
    for (const { team, athletes } of perTeam.values()) {
      if (!team.owner?.email) continue;
      await this.email
        .sendMembershipPastDueSummary(team.owner.email, { name: team.owner.name, teamName: team.name, athletes })
        .catch((e) => this.logger.warn(`Resumo de atrasos da equipe ${team.id}: ${e?.message}`));
    }
    if (marked) this.logger.log(`Mensalidades: ${marked} marcada(s) como inadimplente(s)`);
    return { marked, teams: perTeam.size };
  }

  /**
   * Reconciliação com o Asaas (rede local, onde o webhook não chega): no máximo a cada
   * MEMBERSHIP_RECONCILE_MINUTES (padrão 10) e até 50 mensalidades por rodada.
   */
  async reconcileOpen(now = new Date(), force = false) {
    if (!this.asaas.isConfigured) return { checked: 0, skipped: 'asaas-off' };
    const everyMin = Math.max(1, Number(process.env.MEMBERSHIP_RECONCILE_MINUTES || 10));
    if (!force && now.getTime() - this.lastJobReconcileAt < everyMin * 60_000) return { checked: 0, skipped: 'throttled' };
    this.lastJobReconcileAt = now.getTime();
    const list = await this.prisma.athleteMembership.findMany({
      where: {
        provider: PaymentProvider.ASAAS,
        externalSubscriptionId: { not: null },
        OR: [
          { status: { in: [MembershipStatus.PENDING, MembershipStatus.PAST_DUE] } },
          { status: MembershipStatus.ACTIVE, nextDueDate: { lte: new Date(now.getTime() + DAY_MS) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
      include: { plan: true, team: true },
    });
    let checked = 0;
    for (const m of list) {
      try {
        await this.reconcileMembership(m);
        checked++;
      } catch (e: any) {
        this.logger.warn(`Reconciliação mensalidade ${m.id}: ${e?.message}`);
      }
    }
    return { checked };
  }

  /** Busca as cobranças da assinatura e aplica cada uma (idempotente). */
  async reconcileMembership(m: MembershipRow) {
    if (!m.externalSubscriptionId || m.provider !== PaymentProvider.ASAAS || !this.asaas.isConfigured) return;
    const remotes = await this.asaas.listSubscriptionPayments(m.externalSubscriptionId);
    const recent = [...remotes].sort((a, b) => String(b.dueDate ?? '').localeCompare(String(a.dueDate ?? ''))).slice(0, 6).reverse();
    for (const r of recent) {
      await this.checkout.ingestMembershipRemotePayment(this.forBilling(m), { ...r, subscription: r.subscription ?? m.externalSubscriptionId }, 'RECONCILE');
    }
  }

  /** FAKE (dev/test): gera a cobrança do próximo ciclo até 7 dias antes do vencimento. */
  async generateFakeRenewals(now = new Date()) {
    if (!fakeProviderAllowed()) return { created: 0 };
    const due = await this.prisma.athleteMembership.findMany({
      where: {
        provider: PaymentProvider.FAKE,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PAST_DUE] },
        nextDueDate: { lte: new Date(now.getTime() + 7 * DAY_MS) },
      },
      take: 200,
    });
    let created = 0;
    for (const m of due) {
      const open = await this.prisma.payment.findFirst({ where: { membershipId: m.id, status: PaymentStatus.PENDING }, select: { id: true } });
      if (open || !m.nextDueDate) continue;
      await this.createFakePayment(m, m.nextDueDate);
      created++;
    }
    return { created };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Internos
  // ════════════════════════════════════════════════════════════════════════

  private forBilling(m: { id: string; teamId: string; athleteId: string; status: MembershipStatus; priceInCents: number; externalSubscriptionId: string | null; team?: { graceDays: number } | null }): MembershipForBilling {
    return {
      id: m.id,
      teamId: m.teamId,
      athleteId: m.athleteId,
      status: m.status,
      priceInCents: m.priceInCents,
      externalSubscriptionId: m.externalSubscriptionId,
      team: m.team ? { graceDays: m.team.graceDays } : null,
    };
  }

  private async cancelMembership(m: MembershipRow, reason: string) {
    await this.stopGateway(m);
    await this.closeOpenPayments(m.id, 'CANCELED');
    const now = new Date();
    const u = await this.prisma.athleteMembership.update({
      where: { id: m.id },
      data: { status: MembershipStatus.CANCELED, canceledAt: now, cancelReason: reason.slice(0, 300), nextDueDate: null },
    });
    const accessUntil = u.currentPeriodEnd && u.currentPeriodEnd.getTime() > now.getTime() ? u.currentPeriodEnd : null;
    return { id: u.id, status: u.status, canceledAt: u.canceledAt, accessUntil };
  }

  /** Encerra a assinatura no gateway (Asaas remove as cobranças pendentes). Já removida → ok. */
  private async stopGateway(m: { provider: PaymentProvider; externalSubscriptionId: string | null; id: string }) {
    if (m.provider !== PaymentProvider.ASAAS || !m.externalSubscriptionId) return;
    if (!this.asaas.isConfigured) {
      this.logger.error(`Mensalidade ${m.id}: assinatura Asaas ${m.externalSubscriptionId} não cancelada (ASAAS_API_KEY ausente)`);
      throw new ServiceUnavailableException('Gateway de pagamento indisponível — tente novamente');
    }
    try {
      await this.asaas.cancelSubscription(m.externalSubscriptionId);
    } catch (err) {
      const sub = await this.asaas.getSubscription(m.externalSubscriptionId).catch(() => null);
      if (sub && (sub.deleted || sub.status === 'INACTIVE')) return;
      throw err;
    }
  }

  private async closeOpenPayments(membershipId: string, reason: string) {
    // crédito de indicação reservado em cobranças em aberto volta ao saldo
    const reserved = await this.prisma.payment
      .findMany({ where: { membershipId, status: PaymentStatus.PENDING }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    for (const p of reserved ?? []) await releaseCredit(this.prisma, p.id).catch(() => 0);
    // Cobranças AVULSAS da mensalidade (1ª com desconto de indicação) não somem com a assinatura: remove no gateway
    if (this.asaas?.isConfigured) {
      const open = await this.prisma.payment
        .findMany({
          where: { membershipId, status: PaymentStatus.PENDING, provider: PaymentProvider.ASAAS, externalPaymentId: { not: null } },
          select: { externalPaymentId: true },
        })
        .catch(() => [] as { externalPaymentId: string | null }[]);
      for (const p of open ?? []) {
        if (!p.externalPaymentId) continue;
        await Promise.resolve()
          .then(() => this.asaas.cancelPayment(p.externalPaymentId!))
          .catch(() => undefined); // cobrança da assinatura já removida pelo stopGateway
      }
    }
    await this.prisma.payment.updateMany({
      where: { membershipId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED, failureReason: reason },
    });
  }

  private async ensureAsaasCustomer(userId: string, buyer?: CheckoutBuyer | null): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { asaasCustomerId: true } });
    if (u?.asaasCustomerId) return u.asaasCustomerId;
    if (!buyer) throw new ConflictException('Atleta sem cadastro de pagamento — ele precisa assinar novamente pelo app');
    const customer = await this.asaas.findOrCreateCustomer({
      name: buyer.name,
      cpfCnpj: buyer.cpf,
      email: buyer.email,
      mobilePhone: buyer.phone,
      externalReference: userId,
    });
    // só o id do cliente Asaas é guardado — o CPF nunca é persistido
    await this.prisma.user
      .update({ where: { id: userId }, data: { asaasCustomerId: customer } })
      .catch((e) => this.logger.warn(`Não foi possível salvar asaasCustomerId: ${e?.message}`));
    return customer;
  }

  /**
   * Inicia a cobrança recorrente (assinatura no Asaas com split, ou FAKE) e devolve a 1ª cobrança
   * (linha Payment MEMBERSHIP com token de consulta — reaproveita /pedido/[paymentId]).
   *
   * Desconto de indicação (`discountCents` > 0): a assinatura do Asaas não aceita desconto só na 1ª
   * cobrança, então a 1ª cobrança é AVULSA (POST /payments, valor − desconto, mesmo split, externalReference =
   * id da linha Payment MEMBERSHIP) e a assinatura começa no ciclo seguinte (firstDue + periodicidade) com o
   * valor cheio. A cobrança avulsa segue o fluxo normal de Payment (webhook → applyAsaasStatus → MEMBERSHIP →
   * membershipPaid), e o período pago vai de firstDue a firstDue + periodicidade — exatamente até o 1º
   * vencimento da assinatura.
   */
  private async startBilling(
    m: MembershipRow,
    team: Pick<ResolvedTeam, 'id' | 'name' | 'asaasWalletId' | 'platformFeePercent'> & { graceDays?: number },
    opts: { buyer?: CheckoutBuyer | null; billingType: MembershipBillingType; firstDue: Date; discountCents?: number; creditCents?: number },
  ): Promise<{ membership: MembershipRow; payment: any | null; token: string | null; discountCents: number; creditCents: number }> {
    const discount = Math.max(0, Math.min(opts.discountCents ?? 0, m.priceInCents - MIN_CHARGE_AFTER_CREDIT_CENTS));
    const creditWanted = Math.max(0, Math.min(opts.creditCents ?? 0, m.priceInCents - discount - MIN_CHARGE_AFTER_CREDIT_CENTS));
    const refKey = `MEMBERSHIP:${m.id}`;
    if (m.provider === PaymentProvider.FAKE) {
      const membership = await this.prisma.athleteMembership.update({
        where: { id: m.id },
        data: { externalSubscriptionId: `fake_sub_${m.id}_${Date.now()}`, nextDueDate: opts.firstDue },
        include: { plan: true, team: true },
      });
      const id = randomUUID();
      const credit = creditWanted ? await reserveCredit(this.prisma, m.athleteId, id, creditWanted, refKey).catch(() => 0) : 0;
      const { payment, token } = await this.createFakePayment(membership, opts.firstDue, m.priceInCents - discount - credit, id);
      return { membership, payment, token, discountCents: discount, creditCents: credit };
    }

    const customer = await this.ensureAsaasCustomer(m.athleteId, opts.buyer);
    const split = buildTeamSplit({ id: team.id, asaasWalletId: team.asaasWalletId, platformFeePercent: team.platformFeePercent });
    if (discount > 0 || creditWanted > 0) {
      return this.startDiscountedBilling(m, team, opts, { customer, split, discount, creditWanted, refKey });
    }
    const sub = await this.asaas.createSubscription({
      customer,
      billingType: opts.billingType as AsaasBillingType,
      valueInCents: m.priceInCents,
      nextDueDate: toAsaasDate(opts.firstDue),
      cycle: asaasCycle(m.plan.interval),
      description: `${m.plan.name} — ${team.name}`,
      externalReference: m.id,
      split,
    });
    const membership = await this.prisma.athleteMembership.update({
      where: { id: m.id },
      data: { externalSubscriptionId: sub.id, nextDueDate: opts.firstDue },
      include: { plan: true, team: true },
    });

    // 1ª cobrança: o Asaas gera junto com a assinatura (pode levar um instante)
    let first: AsaasPayment | undefined;
    for (let i = 0; i < 3 && !first; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 700));
      const list = await this.asaas.listSubscriptionPayments(sub.id).catch(() => [] as AsaasPayment[]);
      first = [...list]
        .filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE')
        .sort((a, b) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')))[0];
    }
    if (!first) {
      this.logger.warn(`Assinatura ${sub.id}: 1ª cobrança ainda não disponível — chegará pelo webhook/reconciliação`);
      return { membership, payment: null, token: null, discountCents: 0, creditCents: 0 };
    }

    const newId = randomUUID();
    let token = derivedPaymentToken(newId) ?? randomBytes(24).toString('base64url');
    let row = await this.checkout.upsertMembershipPayment(
      this.forBilling(membership),
      { ...first, subscription: first.subscription ?? sub.id },
      { id: newId, accessTokenHash: sha256(token) },
    );
    if (row.id !== newId) {
      // o webhook PAYMENT_CREATED criou a linha antes: token passa a ser o derivado dela
      token = derivedPaymentToken(row.id) ?? randomBytes(24).toString('base64url');
      row = await this.prisma.payment.update({ where: { id: row.id }, data: { accessTokenHash: sha256(token) } });
    }
    if (opts.billingType === 'PIX' || opts.billingType === 'UNDEFINED') {
      const pix = await this.asaas.getPixQrCode(first.id).catch((e) => {
        this.logger.warn(`QR Code Pix indisponível para ${first!.id}: ${e?.message}`);
        return null;
      });
      if (pix) {
        row = await this.prisma.payment.update({
          where: { id: row.id },
          data: {
            pixQrCode: pix.payload,
            pixQrCodeUrl: pix.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null,
            pixExpiresAt: pix.expirationDate ? new Date(pix.expirationDate) : null,
          },
        });
      }
    }
    return { membership, payment: row, token, discountCents: 0, creditCents: 0 };
  }

  /** 1ª cobrança avulsa com desconto de indicação + assinatura a partir do ciclo seguinte (ver startBilling). */
  private async startDiscountedBilling(
    m: MembershipRow,
    team: Pick<ResolvedTeam, 'id' | 'name'>,
    opts: { billingType: MembershipBillingType; firstDue: Date },
    ctx: { customer: string; split: ReturnType<typeof buildTeamSplit>; discount: number; creditWanted?: number; refKey?: string },
  ): Promise<{ membership: MembershipRow; payment: any | null; token: string | null; discountCents: number; creditCents: number }> {
    const secondDue = addMonths(opts.firstDue, intervalMonths(m.plan.interval));
    const sub = await this.asaas.createSubscription({
      customer: ctx.customer,
      billingType: opts.billingType as AsaasBillingType,
      valueInCents: m.priceInCents,
      nextDueDate: toAsaasDate(secondDue),
      cycle: asaasCycle(m.plan.interval),
      description: `${m.plan.name} — ${team.name}`,
      externalReference: m.id,
      split: ctx.split,
    });
    const membership = await this.prisma.athleteMembership.update({
      where: { id: m.id },
      data: { externalSubscriptionId: sub.id, nextDueDate: opts.firstDue },
      include: { plan: true, team: true },
    });

    const id = randomUUID();
    const credit = ctx.creditWanted
      ? await reserveCredit(this.prisma, m.athleteId, id, ctx.creditWanted, ctx.refKey ?? `MEMBERSHIP:${m.id}`).catch(() => 0)
      : 0;
    const amount = m.priceInCents - ctx.discount - credit;
    const token = derivedPaymentToken(id) ?? randomBytes(24).toString('base64url');
    let row = await this.prisma.payment.create({
      data: {
        id,
        userId: m.athleteId,
        purpose: PaymentPurpose.MEMBERSHIP,
        membershipId: m.id,
        teamId: m.teamId,
        amount,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.ASAAS,
        method: opts.billingType,
        expiresAt: opts.firstDue,
        accessTokenHash: sha256(token),
      },
    });
    try {
      const charge = await this.asaas.createPayment({
        customer: ctx.customer,
        billingType: opts.billingType as AsaasBillingType,
        valueInCents: amount,
        dueDate: toAsaasDate(opts.firstDue),
        description: `${m.plan.name} — ${team.name} (1ª mensalidade com desconto${credit ? ' / crédito' : ''} de indicação)`,
        externalReference: id,
        split: ctx.split,
      });
      let pix: { encodedImage: string; payload: string; expirationDate?: string } | null = null;
      if (opts.billingType === 'PIX' || opts.billingType === 'UNDEFINED') {
        pix = await this.asaas.getPixQrCode(charge.id).catch((e) => {
          this.logger.warn(`QR Code Pix indisponível para ${charge.id}: ${e?.message}`);
          return null;
        });
      }
      row = await this.prisma.payment.update({
        where: { id },
        data: {
          externalPaymentId: charge.id,
          checkoutUrl: charge.invoiceUrl ?? charge.bankSlipUrl ?? null,
          pixQrCode: pix?.payload ?? null,
          pixQrCodeUrl: pix?.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null,
          pixExpiresAt: pix?.expirationDate ? new Date(pix.expirationDate) : null,
        },
      });
    } catch (err) {
      // sem a 1ª cobrança não deixa a assinatura órfã no gateway
      await this.prisma.payment.update({ where: { id }, data: { status: PaymentStatus.FAILED, failureReason: 'GATEWAY_ERROR' } }).catch(() => undefined);
      if (credit) await releaseCredit(this.prisma, id).catch(() => 0);
      await this.asaas.cancelSubscription(sub.id).catch((e) => this.logger.error(`Assinatura ${sub.id} órfã — cancelar no Asaas: ${e?.message}`));
      throw err;
    }
    return { membership, payment: row, token, discountCents: ctx.discount, creditCents: credit };
  }

  private async createFakePayment(
    m: { id: string; teamId: string; athleteId: string; priceInCents: number },
    due: Date,
    amountInCents = m.priceInCents,
    id: string = randomUUID(),
  ) {
    const token = derivedPaymentToken(id) ?? randomBytes(24).toString('base64url');
    const payload = `FAKE-PIX|${id}|${amountInCents}`;
    const qr = await QRCode.toDataURL(payload).catch(() => null);
    const payment = await this.prisma.payment.create({
      data: {
        id,
        userId: m.athleteId,
        purpose: PaymentPurpose.MEMBERSHIP,
        membershipId: m.id,
        teamId: m.teamId,
        amount: amountInCents,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.FAKE,
        method: 'PIX',
        externalPaymentId: `fake_${id}`,
        pixQrCode: payload,
        pixQrCodeUrl: qr,
        expiresAt: due,
        accessTokenHash: sha256(token),
      },
    });
    return { payment, token };
  }

  private toCheckout(m: { id: string; status: MembershipStatus; provider: PaymentProvider; priceInCents: number }, p: any | null, token: string | null): MembershipCheckout {
    return {
      membershipId: m.id,
      membershipStatus: m.status,
      paymentId: p?.id ?? null,
      accessToken: p ? token : null,
      provider: p?.provider ?? m.provider,
      method: p?.method ?? 'UNDEFINED',
      amountInCents: p?.amount ?? m.priceInCents,
      status: p?.status ?? null,
      checkoutUrl: p?.checkoutUrl ?? null,
      pix: p?.pixQrCode
        ? {
            qrCodeBase64: p.pixQrCodeUrl ?? null,
            copyPaste: p.pixQrCode,
            expiresAt: p.pixExpiresAt ? new Date(p.pixExpiresAt).toISOString() : null,
          }
        : null,
      dueDate: p?.expiresAt ? new Date(p.expiresAt).toISOString() : null,
      payPath: p ? `/pedido/${p.id}${token ? `?token=${encodeURIComponent(token)}` : ''}` : null,
    };
  }
}

/** Meia-noite (SP) do dia de `d`. */
function spMidnightOf(d: Date): Date {
  return dateFromAsaas(toAsaasDate(d))!;
}
