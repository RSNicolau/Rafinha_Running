import {
  Injectable,
  Optional,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  StoreOrderStatus,
  EventRegistrationStatus,
  CoachSubscriptionStatus,
  PlatformPlanType,
  NotificationType,
  MembershipStatus,
} from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as QRCode from 'qrcode';
import type Stripe from 'stripe';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  AsaasService, AsaasBillingType, AsaasPayment, AsaasSplit, ASAAS_PAID_STATUSES, ASAAS_FAILED_STATUSES, ASAAS_REFUNDED_STATUSES,
} from '../asaas/asaas.service';
import { StripeService } from '../stripe/stripe.service';
import { FulfillmentService, BOLETO_TTL_MS, CHECKOUT_TTL_MS, FulfillmentOutcome } from './fulfillment.service';
import { isValidCpfCnpj, onlyDigits } from './cpf.util';
import { buildTeamSplit, dateFromAsaas, isBeyondGrace, resolveTeamOfUser } from './membership.util';
import { ReferralsService } from '../../referrals/referrals.service';
import { consumeCredit, creditCentsOf, planCredit, releaseCredit, reserveCredit, settleCreditReservations } from '../../referrals/referral-credit';

export type CheckoutMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
export type CheckoutPurpose = 'STORE_ORDER' | 'EVENT_REGISTRATION' | 'PLATFORM_PLAN';

export interface CheckoutBuyer {
  name: string;
  email: string;
  cpf: string;
  phone?: string | null;
}

export interface CreateCheckoutInput {
  purpose: CheckoutPurpose;
  refId: string;
  buyer: CheckoutBuyer;
  provider?: 'ASAAS' | 'STRIPE';
  method?: CheckoutMethod;
  userId?: string | null;
  /** Token público do pedido (loja, compra como visitante) */
  refToken?: string | null;
  /** Usa o crédito de indicação do atleta (padrão: true; só loja/eventos com usuário logado). */
  useCredit?: boolean;
}

export interface CheckoutResult {
  paymentId: string;
  /** Token opaco para consultar o status sem login (guardar no cliente; só é exibido uma vez). */
  accessToken: string;
  provider: PaymentProvider;
  method: CheckoutMethod;
  amountInCents: number;
  status: PaymentStatus;
  checkoutUrl: string | null;
  pix: { qrCodeBase64: string | null; copyPaste: string; expiresAt: string | null } | null;
  expiresAt: string | null;
  /** Crédito de indicação abatido desta cobrança (centavos). */
  creditAppliedCents: number;
}

export type MarkPaidSource = 'ASAAS' | 'STRIPE' | 'FAKE' | 'RECONCILE' | 'PAGARME' | 'MANUAL';

/** Valida e normaliza os dados do pagador (CPF validado aqui e NUNCA persistido). */
export function validateCheckoutBuyer(b: CheckoutBuyer): CheckoutBuyer {
  if (!b?.name || b.name.trim().length < 3) throw new BadRequestException('Informe o nome completo');
  if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new BadRequestException('E-mail inválido');
  if (!isValidCpfCnpj(b.cpf)) throw new BadRequestException('CPF inválido');
  return {
    name: b.name.trim().slice(0, 120),
    email: b.email.trim().toLowerCase(),
    cpf: onlyDigits(b.cpf),
    phone: b.phone ? onlyDigits(b.phone).slice(0, 13) || null : null,
  };
}

/** Mensalidade mínima necessária para aplicar o status de uma cobrança do Asaas. */
export type MembershipForBilling = {
  id: string;
  teamId: string;
  athleteId: string;
  status: MembershipStatus;
  priceInCents: number;
  externalSubscriptionId: string | null;
  team?: { graceDays: number } | null;
};

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo, com deslocamento opcional de dias. */
export function saoPauloDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Provedor FAKE: allowlist explícita de ambiente (development/test) + flag, e nunca quando o
 * Asaas aponta para produção (evita simular pagamento num ambiente com cobrança real).
 */
export function fakeProviderAllowed(): boolean {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) return false;
  if (process.env.PAYMENTS_FAKE_PROVIDER !== 'true') return false;
  const asaasUrl = process.env.ASAAS_BASE_URL;
  if (asaasUrl) {
    try {
      if (new URL(asaasUrl).hostname.toLowerCase() === 'api.asaas.com') return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Token público de consulta de status derivado do id (HMAC com segredo do servidor):
 * reaproveitar a cobrança devolve o MESMO token — tokens já entregues continuam válidos.
 * Sem segredo configurado retorna null (o checkout gera token aleatório e não reaproveita).
 */
export function derivedPaymentToken(paymentId: string): string | null {
  const secret = process.env.CHECKOUT_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`checkout-status:${paymentId}`).digest('base64url');
}

const RECONCILE_MAP_MAX = 2000;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  /** throttle de reconciliação ativa por pagamento (status polling) */
  private readonly lastReconcile = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly stripe: StripeService,
    private readonly fulfillment: FulfillmentService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly referrals?: ReferralsService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  // Seleção de provedor
  // ════════════════════════════════════════════════════════════════════════

  selectProvider(requested?: 'ASAAS' | 'STRIPE'): PaymentProvider {
    if (requested === 'STRIPE') {
      if (!this.stripe.isConfigured) throw new BadRequestException('Cartão internacional indisponível no momento');
      return PaymentProvider.STRIPE;
    }
    if (process.env.PAYMENT_PROVIDER === 'STRIPE' && this.stripe.isConfigured) return PaymentProvider.STRIPE;
    if (this.asaas.isConfigured) return PaymentProvider.ASAAS;
    if (this.stripe.isConfigured) return PaymentProvider.STRIPE;
    if (fakeProviderAllowed()) return PaymentProvider.FAKE;
    throw new ServiceUnavailableException('Nenhum gateway de pagamento configurado');
  }

  availableMethods() {
    let provider: PaymentProvider | null = null;
    try {
      provider = this.selectProvider();
    } catch {
      provider = null;
    }
    return {
      provider,
      pix: provider === PaymentProvider.ASAAS || provider === PaymentProvider.FAKE,
      boletoOrCard: provider === PaymentProvider.ASAAS,
      internationalCard: this.stripe.isConfigured,
      fake: provider === PaymentProvider.FAKE,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Criação do checkout
  // ════════════════════════════════════════════════════════════════════════

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const buyer = this.validateBuyer(input.buyer);
    const now = new Date();
    const target = await this.resolveTarget(input, now);

    if (target.amountInCents <= 0) {
      throw new BadRequestException('Este item não exige pagamento');
    }

    const provider = this.selectProvider(input.provider);
    // Loja/eventos: a equipe do treinador do produto / criador do evento recebe via split (Asaas).
    // Plano da plataforma: receita da própria plataforma (sem equipe).
    const team =
      target.purpose === PaymentPurpose.STORE_ORDER || target.purpose === PaymentPurpose.EVENT_REGISTRATION
        ? await resolveTeamOfUser(this.prisma, target.sellerUserId)
        : null;
    const split = provider === PaymentProvider.ASAAS ? buildTeamSplit(team) : undefined;
    if (team && provider === PaymentProvider.STRIPE) {
      // Stripe sem Connect não divide valores: fica tudo na conta da plataforma (repasse manual)
      this.logger.warn(`Checkout Stripe para equipe ${team.id}: sem split — repasse à equipe deve ser manual`);
    }
    const method: CheckoutMethod =
      provider === PaymentProvider.STRIPE ? 'CREDIT_CARD' : provider === PaymentProvider.FAKE ? 'PIX' : input.method ?? 'PIX';

    // Crédito de indicação (loja/eventos, atleta logado): até o valor − R$5; reservado na cobrança, consumido no markPaid
    const creditEligible =
      input.useCredit !== false &&
      !!target.userId &&
      (target.purpose === PaymentPurpose.STORE_ORDER || target.purpose === PaymentPurpose.EVENT_REGISTRATION);
    const refKey = `${target.purpose}:${target.refId}`;
    const plannedCredit = creditEligible
      ? await planCredit(this.prisma, target.userId, refKey, target.amountInCents).catch((e) => {
          this.logger.warn(`Crédito de indicação indisponível: ${e?.message ?? e}`);
          return { cents: 0, pendingPaymentId: null as string | null };
        })
      : { cents: 0, pendingPaymentId: null as string | null };
    const chargeAmount = target.amountInCents - plannedCredit.cents;

    // Reaproveita cobrança pendente recente do mesmo provedor/método (idempotência do clique duplo)
    const reusable = await this.prisma.payment.findFirst({
      where: {
        purpose: target.purpose,
        ...(target.storeOrderId ? { storeOrderId: target.storeOrderId } : {}),
        ...(target.eventRegistrationId ? { eventRegistrationId: target.eventRegistrationId } : {}),
        ...(target.purpose === PaymentPurpose.PLATFORM_PLAN ? { userId: target.userId, planId: target.planId } : {}),
        provider,
        method,
        status: PaymentStatus.PENDING,
        amount: chargeAmount,
        externalPaymentId: { not: null },
        createdAt: { gte: new Date(now.getTime() - 25 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const reusedToken = reusable ? derivedPaymentToken(reusable.id) : null;
    if (reusable && reusedToken && reusable.accessTokenHash === sha256(reusedToken)) {
      // mesmo token de antes: links/telas abertos com o token antigo continuam funcionando
      return this.toResult(reusable, reusedToken, await creditCentsOf(this.prisma, reusable.id).catch(() => 0));
    }

    const paymentId = randomUUID();
    let creditApplied = 0;
    if (plannedCredit.cents > 0) {
      // a reserva do mesmo item em outra cobrança passa para esta
      if (plannedCredit.pendingPaymentId) await releaseCredit(this.prisma, plannedCredit.pendingPaymentId).catch(() => 0);
      creditApplied = await reserveCredit(this.prisma, target.userId!, paymentId, plannedCredit.cents, refKey).catch(() => 0);
    }
    const amountToCharge = target.amountInCents - creditApplied;
    const accessToken = derivedPaymentToken(paymentId) ?? randomBytes(24).toString('base64url');
    const accessTokenHash = sha256(accessToken);

    // Boleto/fatura: a reserva pode ir até BOLETO_TTL a partir da CRIAÇÃO do pedido/inscrição
    // (teto absoluto — gerar novas faturas não estende indefinidamente).
    const holdCap = target.holdStartedAt ? new Date(target.holdStartedAt.getTime() + BOLETO_TTL_MS) : null;
    const slowMethod = method === 'BOLETO' || method === 'UNDEFINED';
    const expiresAt =
      target.purpose === PaymentPurpose.PLATFORM_PLAN
        ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        : slowMethod
          ? new Date(Math.max(
              target.expiresAt?.getTime() ?? 0,
              Math.min(now.getTime() + BOLETO_TTL_MS, holdCap?.getTime() ?? Infinity),
            ))
          : target.expiresAt ?? new Date(now.getTime() + CHECKOUT_TTL_MS);

    const payment = await this.prisma.payment.create({
      data: {
        id: paymentId,
        userId: target.userId ?? null,
        purpose: target.purpose,
        storeOrderId: target.storeOrderId ?? null,
        eventRegistrationId: target.eventRegistrationId ?? null,
        planId: target.planId ?? null,
        teamId: team?.id ?? null,
        amount: amountToCharge,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider,
        method,
        accessTokenHash,
        expiresAt,
      },
    });
    const charged = { ...target, amountInCents: amountToCharge };

    try {
      let data: Record<string, any> = {};
      if (provider === PaymentProvider.ASAAS) {
        data = await this.createAsaasCharge(payment.id, charged, buyer, method, input.userId ?? null, now, split);
      } else if (provider === PaymentProvider.STRIPE) {
        const appUrl = this.appUrl();
        const statusUrl = `${appUrl}/pedido/${payment.id}?token=${encodeURIComponent(accessToken)}`;
        const session = await this.stripe.createCheckoutSession({
          paymentId: payment.id,
          purpose: target.purpose,
          refId: target.refId,
          amountInCents: charged.amountInCents,
          description: target.description,
          customerEmail: buyer.email,
          successUrl: `${statusUrl}&stripe=success`,
          cancelUrl: `${statusUrl}&stripe=cancel`,
        });
        data = { externalPaymentId: session.id, checkoutUrl: session.url };
      } else {
        const payload = `FAKE-PIX|${payment.id}|${charged.amountInCents}`;
        const qr = await QRCode.toDataURL(payload).catch(() => null);
        data = {
          externalPaymentId: `fake_${payment.id}`,
          checkoutUrl: null,
          pixQrCode: payload,
          pixQrCodeUrl: qr,
          pixExpiresAt: expiresAt,
        };
      }
      const updated = await this.prisma.payment.update({ where: { id: payment.id }, data });

      // Boleto/fatura: estende a reserva do pedido/inscrição para dar tempo de compensar
      if (slowMethod) await this.extendReservation(target, expiresAt);

      return this.toResult(updated, accessToken, creditApplied);
    } catch (err: any) {
      await this.prisma.payment
        .update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failureReason: 'GATEWAY_ERROR' } })
        .catch(() => undefined);
      if (creditApplied) await releaseCredit(this.prisma, payment.id).catch(() => 0);
      throw err;
    }
  }

  private validateBuyer(b: CheckoutBuyer): CheckoutBuyer {
    return validateCheckoutBuyer(b);
  }

  private appUrl(): string {
    return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
  }

  private async resolveTarget(input: CreateCheckoutInput, now: Date) {
    if (input.purpose === 'STORE_ORDER') {
      const order = await this.prisma.storeOrder.findUnique({
        where: { id: input.refId },
        include: { product: { select: { name: true, coachId: true } } },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado');
      const ownerOk = !!input.userId && order.athleteId === input.userId;
      const tokenOk = !!input.refToken && !!order.accessTokenHash && safeEqualHex(sha256(input.refToken), order.accessTokenHash);
      if (!ownerOk && !tokenOk) throw new NotFoundException('Pedido não encontrado');
      if (order.status !== StoreOrderStatus.PENDING_PAYMENT) throw new ConflictException('Este pedido não está aguardando pagamento');
      if (order.expiresAt && order.expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException('A reserva deste pedido expirou. Faça um novo pedido.');
      }
      const amount = order.finalInCents ?? Math.max(0, order.totalInCents - order.discountInCents);
      return {
        purpose: PaymentPurpose.STORE_ORDER,
        refId: order.id,
        storeOrderId: order.id,
        eventRegistrationId: undefined as string | undefined,
        planId: undefined as string | undefined,
        userId: order.athleteId ?? input.userId ?? null,
        amountInCents: amount,
        description: `${order.product.name} × ${order.quantity} (pedido #${order.id.slice(0, 8).toUpperCase()})`,
        expiresAt: order.expiresAt,
        holdStartedAt: order.createdAt as Date | null,
        sellerUserId: (order.product as any).coachId as string | null,
      };
    }

    if (input.purpose === 'EVENT_REGISTRATION') {
      if (!input.userId) throw new UnauthorizedException('Faça login para pagar a inscrição');
      const reg = await this.prisma.eventRegistration.findUnique({
        where: { id: input.refId },
        include: { event: { select: { title: true, createdById: true } } },
      });
      if (!reg || reg.userId !== input.userId) throw new NotFoundException('Inscrição não encontrada');
      if (reg.status !== EventRegistrationStatus.PENDING) throw new ConflictException('Esta inscrição não está aguardando pagamento');
      if (reg.paymentExpiresAt && reg.paymentExpiresAt.getTime() <= now.getTime()) {
        throw new ConflictException('O prazo de pagamento desta inscrição expirou. Inscreva-se novamente.');
      }
      return {
        purpose: PaymentPurpose.EVENT_REGISTRATION,
        refId: reg.id,
        storeOrderId: undefined as string | undefined,
        eventRegistrationId: reg.id,
        planId: undefined as string | undefined,
        userId: reg.userId,
        amountInCents: reg.finalPrice ?? 0,
        description: `Inscrição — ${reg.event.title}`,
        expiresAt: reg.paymentExpiresAt,
        holdStartedAt: reg.registeredAt as Date | null,
        sellerUserId: (reg.event as any).createdById as string | null,
      };
    }

    if (input.purpose === 'PLATFORM_PLAN') {
      if (!input.userId) throw new UnauthorizedException('Faça login para assinar um plano');
      if (!(Object.values(PlatformPlanType) as string[]).includes(input.refId)) throw new BadRequestException('Plano inválido');
      const plan = await this.prisma.platformPlan.findUnique({ where: { type: input.refId as PlatformPlanType } });
      if (!plan || !plan.isActive) throw new NotFoundException('Plano não encontrado');
      return {
        purpose: PaymentPurpose.PLATFORM_PLAN,
        refId: plan.type,
        storeOrderId: undefined as string | undefined,
        eventRegistrationId: undefined as string | undefined,
        planId: plan.type as string,
        userId: input.userId,
        amountInCents: plan.priceInCents,
        description: `Plano ${plan.name} — 1 mês`,
        expiresAt: null as Date | null,
        holdStartedAt: null as Date | null,
        sellerUserId: null as string | null,
      };
    }

    throw new BadRequestException('Finalidade de pagamento inválida');
  }

  private async createAsaasCharge(
    paymentId: string,
    target: { description: string; amountInCents: number },
    buyer: CheckoutBuyer,
    method: CheckoutMethod,
    userId: string | null,
    now: Date,
    split?: AsaasSplit[],
  ) {
    let customer: string | null = null;
    if (userId) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { asaasCustomerId: true } });
      customer = u?.asaasCustomerId ?? null;
    }
    if (!customer) {
      customer = await this.asaas.findOrCreateCustomer({
        name: buyer.name,
        cpfCnpj: buyer.cpf,
        email: buyer.email,
        mobilePhone: buyer.phone,
        externalReference: userId ?? undefined,
      });
      if (userId) {
        // Guardamos apenas o id do cliente Asaas — o CPF nunca é persistido no nosso banco
        await this.prisma.user
          .update({ where: { id: userId }, data: { asaasCustomerId: customer } })
          .catch((e) => this.logger.warn(`Não foi possível salvar asaasCustomerId: ${e?.message}`));
      }
    }

    const billingType: AsaasBillingType = method;
    const charge = await this.asaas.createPayment({
      customer,
      billingType,
      valueInCents: target.amountInCents,
      dueDate: saoPauloDate(method === 'BOLETO' || method === 'UNDEFINED' ? 1 : 0, now),
      description: target.description,
      externalReference: paymentId,
      split,
    });

    let pix: { encodedImage: string; payload: string; expirationDate?: string } | null = null;
    if (billingType === 'PIX' || billingType === 'UNDEFINED') {
      pix = await this.asaas.getPixQrCode(charge.id).catch((e) => {
        this.logger.warn(`QR Code Pix indisponível para ${charge.id}: ${e?.message}`);
        return null;
      });
    }

    return {
      externalPaymentId: charge.id,
      checkoutUrl: charge.invoiceUrl ?? charge.bankSlipUrl ?? null,
      pixQrCode: pix?.payload ?? null,
      pixQrCodeUrl: pix?.encodedImage ? `data:image/png;base64,${pix.encodedImage}` : null,
      pixExpiresAt: pix?.expirationDate ? new Date(pix.expirationDate) : null,
    };
  }

  private async extendReservation(
    target: { storeOrderId?: string; eventRegistrationId?: string },
    until: Date,
  ) {
    if (target.storeOrderId) {
      await this.prisma.storeOrder.updateMany({
        where: { id: target.storeOrderId, status: StoreOrderStatus.PENDING_PAYMENT, expiresAt: { lt: until } },
        data: { expiresAt: until },
      });
    }
    if (target.eventRegistrationId) {
      await this.prisma.eventRegistration.updateMany({
        where: { id: target.eventRegistrationId, status: EventRegistrationStatus.PENDING, paymentExpiresAt: { lt: until } },
        data: { paymentExpiresAt: until },
      });
    }
  }

  private toResult(p: any, accessToken: string, creditAppliedCents = 0): CheckoutResult {
    return {
      creditAppliedCents,
      paymentId: p.id,
      accessToken,
      provider: p.provider,
      method: (p.method ?? 'UNDEFINED') as CheckoutMethod,
      amountInCents: p.amount,
      status: p.status,
      checkoutUrl: p.checkoutUrl ?? null,
      pix: p.pixQrCode
        ? {
            qrCodeBase64: p.pixQrCodeUrl ?? null,
            copyPaste: p.pixQrCode,
            expiresAt: p.pixExpiresAt ? new Date(p.pixExpiresAt).toISOString() : null,
          }
        : null,
      expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Transições de estado (idempotentes)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Marca o pagamento como pago e efetiva o pedido/inscrição/plano na MESMA transação.
   * Idempotente: só a primeira transição PENDING|FAILED → SUCCEEDED tem efeito.
   */
  async markPaid(paymentId: string, source: MarkPaidSource): Promise<{ processed: boolean; outcome?: FulfillmentOutcome }> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
        data: { status: PaymentStatus.SUCCEEDED, paidAt: now, failureReason: null },
      });
      if (upd.count === 0) return { processed: false as const };

      const raw = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!raw) return { processed: false as const };
      // Crédito de indicação abatido: o item vale (valor cobrado + crédito) — é isso que o fulfillment confere
      const creditCents = await creditCentsOf(tx, paymentId).catch(() => 0);
      const payment = creditCents ? { ...raw, amount: raw.amount + creditCents } : raw;

      let outcome: FulfillmentOutcome = 'FULFILLED';
      if (payment.purpose === PaymentPurpose.STORE_ORDER && payment.storeOrderId) {
        outcome = (await this.fulfillment.storeOrderPaid(tx, payment.storeOrderId, now, payment)).outcome;
      } else if (payment.purpose === PaymentPurpose.EVENT_REGISTRATION && payment.eventRegistrationId) {
        outcome = (await this.fulfillment.eventRegistrationPaid(tx, payment.eventRegistrationId, now, payment.externalPaymentId, payment)).outcome;
      } else if (payment.purpose === PaymentPurpose.PLATFORM_PLAN) {
        outcome = (await this.fulfillment.platformPlanPaid(tx, payment, now)).outcome;
      } else if (payment.purpose === PaymentPurpose.MEMBERSHIP) {
        outcome = (await this.fulfillment.membershipPaid(tx, payment, now)).outcome;
      }

      if (outcome === 'ALREADY' || outcome === 'NEEDS_REFUND') {
        // Pago, mas o item já estava pago por outro pagamento ou não há mais vaga/estoque → estornar
        await tx.payment.update({ where: { id: paymentId }, data: { failureReason: 'NEEDS_REFUND' } });
        outcome = 'NEEDS_REFUND';
      }
      return { processed: true as const, payment: raw, creditCents, outcome };
    });

    if (!result.processed) return { processed: false };
    if (result.creditCents) {
      // estorno manual pendente (NEEDS_REFUND) → devolve o crédito; senão consome
      const op = result.outcome === 'NEEDS_REFUND'
        ? releaseCredit(this.prisma, paymentId)
        : consumeCredit(this.prisma, paymentId, (m) => this.logger.error(m));
      await op.catch((e) => this.logger.error(`Crédito de indicação da cobrança ${paymentId}: ${e?.message ?? e}`));
    }
    this.logger.log(`Pagamento ${paymentId} confirmado via ${source} → ${result.outcome}`);
    if (result.outcome === 'NEEDS_REFUND') {
      this.logger.error(`Pagamento ${paymentId} recebido sem item disponível — ESTORNAR manualmente no gateway`);
    } else {
      if (result.payment.purpose === PaymentPurpose.MEMBERSHIP) {
        await this.creditReferralOnMembershipPaid(result.payment, result.creditCents ?? 0);
      }
      await this.afterPaid(result.payment).catch((e) => this.logger.warn(`Pós-pagamento ${paymentId}: ${e?.message}`));
    }
    return { processed: true, outcome: result.outcome };
  }

  /**
   * Indicação: 1ª mensalidade paga do indicado → referral PAID + R$50 ao indicador. Roda logo após o commit
   * do pagamento (um erro aqui não pode abortar a transação do pagamento) e é idempotente — só a transição
   * PENDING → PAID da indicação credita, numa transação própria. Se a cobrança saiu com o desconto do indicado
   * (valor < preço da mensalidade), ele NÃO recebe crédito extra; senão recebe R$30 de saldo.
   * Falha aqui não impede a confirmação do pagamento.
   */
  private async creditReferralOnMembershipPaid(payment: { userId: string | null; membershipId?: string | null; amount: number }, creditCents = 0) {
    if (!this.referrals || !payment.userId) return;
    try {
      const m = payment.membershipId
        ? await this.prisma.athleteMembership.findUnique({ where: { id: payment.membershipId }, select: { priceInCents: true } })
        : null;
      // desconto de indicação = o que falta além do crédito de saldo usado
      const discounted = !!m && payment.amount + creditCents < m.priceInCents;
      await this.referrals.creditOnFirstPayment(payment.userId, { refereeDiscountApplied: discounted });
    } catch (e: any) {
      this.logger.warn(`Indicação: falha ao creditar (pagamento da mensalidade ${payment.membershipId}): ${e?.message ?? e}`);
    }
  }

  /** Cobrança vencida/removida no gateway. A liberação da reserva é feita pelo job de expiração. */
  async markFailed(paymentId: string, reason: string): Promise<boolean> {
    const res = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED, failureReason: reason },
    });
    if (res.count === 1) await releaseCredit(this.prisma, paymentId).catch(() => 0);
    return res.count === 1;
  }

  /** Estorno confirmado pelo gateway (ou marcado manualmente). */
  async markRefunded(paymentId: string): Promise<boolean> {
    const done = await this.markRefundedTx(paymentId);
    // estorno: o crédito de indicação usado volta ao saldo do atleta
    if (done) await releaseCredit(this.prisma, paymentId, { includeConsumed: true }).catch(() => 0);
    return done;
  }

  private async markRefundedTx(paymentId: string): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.SUCCEEDED },
        data: { status: PaymentStatus.REFUNDED, refundedAt: now },
      });
      if (upd.count === 0) return false;
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return false;

      if (payment.purpose === PaymentPurpose.STORE_ORDER && payment.storeOrderId) {
        const order = await tx.storeOrder.findUnique({ where: { id: payment.storeOrderId } });
        if (order && order.status !== StoreOrderStatus.REFUNDED && order.status !== StoreOrderStatus.CANCELLED) {
          await this.fulfillment.restockPaidOrder(tx, order);
          await tx.storeOrder.update({
            where: { id: order.id },
            data: { status: StoreOrderStatus.REFUNDED, cancelReason: 'REFUND', statusUpdatedAt: now },
          });
        }
      } else if (payment.purpose === PaymentPurpose.EVENT_REGISTRATION && payment.eventRegistrationId) {
        const released = await this.fulfillment.releaseEventRegistration(tx, payment.eventRegistrationId, {
          paymentStatus: PaymentStatus.REFUNDED,
        });
        if (!released) {
          await tx.eventRegistration.updateMany({
            where: { id: payment.eventRegistrationId },
            data: { paymentStatus: PaymentStatus.REFUNDED },
          });
        } else {
          await this.fulfillment.promoteWaitlist(tx, released.previous.eventId, now);
          await this.fulfillment.refreshSoldOut(tx, released.previous.eventId, now);
        }
      } else if (payment.purpose === PaymentPurpose.PLATFORM_PLAN && payment.userId && payment.externalPaymentId) {
        // só cancela se a assinatura atual foi ativada por ESTE pagamento
        await tx.coachSubscription.updateMany({
          where: { coachId: payment.userId, externalId: payment.externalPaymentId },
          data: { status: CoachSubscriptionStatus.CANCELED },
        });
      }
      return true;
    });
  }

  /** Notificações pós-pagamento (fora da transação). */
  private async afterPaid(payment: { purpose: PaymentPurpose; storeOrderId: string | null; eventRegistrationId: string | null; userId: string | null; amount: number; planId: string | null; membershipId?: string | null }) {
    if (payment.purpose === PaymentPurpose.MEMBERSHIP && payment.membershipId) {
      const m = await this.prisma.athleteMembership.findUnique({
        where: { id: payment.membershipId },
        include: {
          plan: { select: { name: true } },
          team: { select: { name: true } },
          athlete: { select: { id: true, email: true, name: true } },
        },
      });
      if (!m) return;
      if (m.athlete.email) {
        await this.email.sendMembershipPaid(m.athlete.email, {
          name: m.athlete.name,
          teamName: m.team.name,
          planName: m.plan.name,
          amountInCents: payment.amount,
          periodEnd: m.currentPeriodEnd,
        });
      }
      await this.notifications
        .createNotification(m.athlete.id, NotificationType.PAYMENT_SUCCESS, 'Mensalidade confirmada', `${m.plan.name} — ${m.team.name}`, { membershipId: m.id })
        .catch(() => undefined);
      return;
    }
    if (payment.purpose === PaymentPurpose.STORE_ORDER && payment.storeOrderId) {
      const order = await this.prisma.storeOrder.findUnique({
        where: { id: payment.storeOrderId },
        include: { product: { select: { name: true, estimatedDelivery: true } } },
      });
      if (!order) return;
      await this.email.sendStoreOrderPaid(order.customerEmail, {
        name: order.customerName,
        orderId: order.id,
        productName: order.product.name,
        quantity: order.quantity,
        size: order.size,
        color: order.color,
        totalInCents: payment.amount,
        isPreOrder: order.isPreOrder,
        estimatedDelivery: order.product.estimatedDelivery,
        deliveryMethod: order.deliveryMethod,
      });
      if (order.athleteId) {
        await this.notifications
          .createNotification(order.athleteId, NotificationType.PAYMENT_SUCCESS, 'Pagamento confirmado', `Seu pedido de ${order.product.name} foi pago.`, { storeOrderId: order.id })
          .catch(() => undefined);
      }
      return;
    }
    if (payment.purpose === PaymentPurpose.EVENT_REGISTRATION && payment.eventRegistrationId) {
      await this.sendRegistrationConfirmed(payment.eventRegistrationId, payment.amount);
      return;
    }
    if (payment.purpose === PaymentPurpose.PLATFORM_PLAN && payment.userId) {
      const [user, sub] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: payment.userId }, select: { email: true, name: true } }),
        this.prisma.coachSubscription.findUnique({ where: { coachId: payment.userId }, include: { plan: true } }),
      ]);
      if (user?.email && sub) {
        await this.email.sendPlatformPlanActivated(user.email, {
          name: user.name,
          planName: sub.plan.name,
          periodEnd: sub.currentPeriodEnd,
          amountInCents: payment.amount,
        });
      }
    }
  }

  /** E-mail + push de inscrição confirmada (usado também por eventos gratuitos). */
  async sendRegistrationConfirmed(registrationId: string, amountPaidInCents?: number | null) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: { select: { id: true, title: true, eventDate: true, kitPickupLocation: true, kitPickupDate: true } },
        user: { select: { id: true, email: true, name: true } },
        distance: { select: { name: true } },
      },
    });
    if (!reg) return;
    if (reg.user.email) {
      await this.email.sendEventRegistrationConfirmed(reg.user.email, {
        name: reg.user.name,
        eventTitle: reg.event.title,
        eventDate: reg.event.eventDate,
        bibNumber: reg.bibNumber,
        distanceName: reg.distance?.name ?? null,
        kitPickupLocation: reg.event.kitPickupLocation,
        kitPickupDate: reg.event.kitPickupDate,
        amountPaidInCents: amountPaidInCents ?? null,
      });
    }
    await this.notifications
      .createNotification(
        reg.user.id,
        NotificationType.EVENT_REGISTRATION,
        'Inscrição confirmada',
        `${reg.event.title}${reg.bibNumber ? ` — peito nº ${reg.bibNumber}` : ''}`,
        { eventId: reg.event.id, registrationId: reg.id },
      )
      .catch(() => undefined);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Consulta de status (dono via JWT ou token público)
  // ════════════════════════════════════════════════════════════════════════

  private async loadAuthorized(paymentId: string, access: { userId?: string | null; token?: string | null }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    const ownerOk = !!payment && !!access.userId && payment.userId === access.userId;
    const tokenOk =
      !!payment && !!access.token && !!payment.accessTokenHash && safeEqualHex(sha256(access.token), payment.accessTokenHash);
    // 404 genérico: não revela se o id existe
    if (!payment || (!ownerOk && !tokenOk)) throw new NotFoundException('Pagamento não encontrado');
    return payment;
  }

  async getStatus(paymentId: string, access: { userId?: string | null; token?: string | null }) {
    let payment = await this.loadAuthorized(paymentId, access);

    // Reconciliação ativa: útil na rede local (o webhook do gateway não alcança o servidor)
    if (payment.status === PaymentStatus.PENDING && payment.externalPaymentId) {
      const last = this.lastReconcile.get(payment.id) ?? 0;
      if (Date.now() - last > 10_000) {
        this.rememberReconcile(payment.id);
        await this.reconcile(payment).catch((e) => this.logger.warn(`Reconciliação ${payment.id}: ${e?.message}`));
        payment = (await this.prisma.payment.findUnique({ where: { id: paymentId } }))!;
      }
    }

    let reference: Record<string, any> | null = null;
    if (payment.storeOrderId) {
      const order = await this.prisma.storeOrder.findUnique({
        where: { id: payment.storeOrderId },
        include: { product: { select: { name: true, estimatedDelivery: true, images: true } } },
      });
      if (order) {
        reference = {
          type: 'STORE_ORDER',
          orderId: order.id,
          orderCode: order.id.slice(0, 8).toUpperCase(),
          status: order.status,
          productName: order.product.name,
          productImage: order.product.images?.[0] ?? null,
          quantity: order.quantity,
          size: order.size,
          color: order.color,
          isPreOrder: order.isPreOrder,
          estimatedDelivery: order.product.estimatedDelivery,
          expiresAt: order.expiresAt,
        };
      }
    } else if (payment.eventRegistrationId) {
      const reg = await this.prisma.eventRegistration.findUnique({
        where: { id: payment.eventRegistrationId },
        include: { event: { select: { id: true, title: true, eventDate: true } } },
      });
      if (reg) {
        reference = {
          type: 'EVENT_REGISTRATION',
          registrationId: reg.id,
          eventId: reg.event.id,
          eventTitle: reg.event.title,
          eventDate: reg.event.eventDate,
          status: reg.status,
          bibNumber: reg.status === EventRegistrationStatus.CONFIRMED || reg.status === EventRegistrationStatus.CHECKED_IN ? reg.bibNumber : null,
          expiresAt: reg.paymentExpiresAt,
        };
      }
    } else if (payment.purpose === PaymentPurpose.PLATFORM_PLAN) {
      reference = { type: 'PLATFORM_PLAN', planType: payment.planId };
    } else if (payment.purpose === PaymentPurpose.MEMBERSHIP && payment.membershipId) {
      const m = await this.prisma.athleteMembership.findUnique({
        where: { id: payment.membershipId },
        include: { plan: { select: { name: true, interval: true } }, team: { select: { name: true, slug: true } } },
      });
      if (m) {
        reference = {
          type: 'MEMBERSHIP',
          membershipId: m.id,
          membershipStatus: m.status,
          planName: m.plan.name,
          interval: m.plan.interval,
          teamName: m.team.name,
          teamSlug: m.team.slug,
          dueDate: payment.expiresAt,
          currentPeriodEnd: m.currentPeriodEnd,
        };
      }
    }
    // Mensalidade: expiresAt guarda o VENCIMENTO (a cobrança continua pagável depois dele) — não é prazo de reserva
    const isMembership = payment.purpose === PaymentPurpose.MEMBERSHIP;

    return {
      paymentId: payment.id,
      status: payment.status,
      purpose: payment.purpose,
      provider: payment.provider,
      method: payment.method,
      amountInCents: payment.amount,
      checkoutUrl: payment.checkoutUrl,
      pix: payment.pixQrCode
        ? { qrCodeBase64: payment.pixQrCodeUrl, copyPaste: payment.pixQrCode, expiresAt: payment.pixExpiresAt }
        : null,
      paidAt: payment.paidAt,
      expiresAt: isMembership ? null : payment.expiresAt,
      dueDate: isMembership ? payment.expiresAt : null,
      needsRefund: payment.failureReason === 'NEEDS_REFUND',
      underReview: ['AMOUNT_MISMATCH', 'REFERENCE_MISMATCH', 'CHARGEBACK'].includes(payment.failureReason ?? ''),
      fakePayAvailable: payment.provider === PaymentProvider.FAKE && fakeProviderAllowed(),
      reference,
    };
  }

  /** Mapa limitado: descarta entradas antigas para não crescer sem limite. */
  private rememberReconcile(paymentId: string) {
    const nowMs = Date.now();
    this.lastReconcile.delete(paymentId);
    this.lastReconcile.set(paymentId, nowMs);
    if (this.lastReconcile.size > RECONCILE_MAP_MAX) {
      for (const [k, t] of this.lastReconcile) {
        if (this.lastReconcile.size <= RECONCILE_MAP_MAX / 2 && nowMs - t < 60_000) break;
        this.lastReconcile.delete(k);
      }
    }
  }

  /** Consulta o gateway e aplica a transição (nunca confia no cliente). */
  async reconcile(payment: {
    id: string;
    provider: PaymentProvider;
    externalPaymentId: string | null;
    amount: number;
    purpose?: PaymentPurpose;
    membershipId?: string | null;
    failureReason?: string | null;
  }) {
    if (!payment.externalPaymentId) return;
    if (payment.provider === PaymentProvider.ASAAS && this.asaas.isConfigured) {
      const remote = await this.asaas.getPayment(payment.externalPaymentId);
      await this.applyAsaasStatus(payment, remote, 'RECONCILE');
    } else if (payment.provider === PaymentProvider.STRIPE && this.stripe.isConfigured) {
      const session = await this.stripe.retrieveCheckoutSession(payment.externalPaymentId);
      await this.applyStripeSession(payment, session, session.status === 'expired' ? 'expired' : 'completed');
    }
  }

  async fakePay(paymentId: string, access: { userId?: string | null; token?: string | null }) {
    if (!fakeProviderAllowed()) throw new NotFoundException();
    const payment = await this.loadAuthorized(paymentId, access);
    if (payment.provider !== PaymentProvider.FAKE) throw new ForbiddenException('Pagamento não é do provedor de testes');
    const r = await this.markPaid(payment.id, 'FAKE');
    return { ok: true, ...r };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Webhooks
  // ════════════════════════════════════════════════════════════════════════

  async handleAsaasWebhook(token: string | undefined, body: any) {
    if (!this.asaas.verifyWebhookToken(token)) throw new UnauthorizedException('Token do webhook Asaas inválido');

    const externalId: string | undefined = body?.payment?.id;
    const event: string = String(body?.event ?? '');
    if (!externalId) return { received: true, ignored: 'no-payment' };

    const payment = await this.prisma.payment.findFirst({
      where: { externalPaymentId: externalId, provider: PaymentProvider.ASAAS },
    });
    if (!payment) {
      // Cobrança gerada por assinatura (mensalidade): o Asaas cria as cobranças de cada ciclo sozinho
      const subscriptionId: string | undefined = body?.payment?.subscription ?? undefined;
      if (subscriptionId) {
        const membership = await this.prisma.athleteMembership.findUnique({
          where: { externalSubscriptionId: String(subscriptionId) },
          include: { team: { select: { graceDays: true } } },
        });
        if (membership) {
          const remote = await this.asaas.getPayment(externalId);
          const applied = await this.ingestMembershipRemotePayment(membership, remote, 'ASAAS');
          return { received: true, ...applied };
        }
      }
      this.logger.warn(`Webhook Asaas ${event} para cobrança desconhecida ${externalId}`);
      return { received: true, ignored: 'unknown-payment' };
    }

    // NÃO confia no corpo: re-consulta a cobrança no Asaas (erro → 5xx, o Asaas reenvia)
    const remote = await this.asaas.getPayment(externalId);
    const applied = await this.applyAsaasStatus(payment, remote, 'ASAAS');
    return { received: true, ...applied };
  }

  private async applyAsaasStatus(
    payment: { id: string; amount: number; purpose?: PaymentPurpose; membershipId?: string | null; failureReason?: string | null },
    remote: AsaasPayment,
    source: MarkPaidSource,
  ) {
    if (payment.purpose === PaymentPurpose.MEMBERSHIP) {
      const membership = payment.membershipId
        ? await this.prisma.athleteMembership.findUnique({
            where: { id: payment.membershipId },
            include: { team: { select: { graceDays: true } } },
          })
        : null;
      if (!membership) {
        await this.flagForReview(payment.id, 'REFERENCE_MISMATCH', `Asaas ${remote.id}: mensalidade ${payment.membershipId} inexistente`);
        return { ignored: 'unknown-membership' };
      }
      return this.applyMembershipAsaasStatus(payment, membership, remote, source);
    }
    if (remote.externalReference !== payment.id) {
      await this.flagForReview(payment.id, 'REFERENCE_MISMATCH', `Asaas ${remote.id}: externalReference ${remote.externalReference} ≠ ${payment.id}`);
      return { ignored: 'reference-mismatch' };
    }
    if (Math.round(Number(remote.value) * 100) !== payment.amount) {
      // 200 para o Asaas não reenviar, mas a cobrança fica sinalizada para revisão/estorno
      await this.flagForReview(payment.id, 'AMOUNT_MISMATCH', `Asaas ${remote.id}: valor ${remote.value} ≠ ${payment.amount / 100} (status ${remote.status})`);
      return { ignored: 'amount-mismatch' };
    }
    if (ASAAS_PAID_STATUSES.has(remote.status)) {
      const r = await this.markPaid(payment.id, source);
      return { action: 'paid', processed: r.processed };
    }
    if (ASAAS_FAILED_STATUSES.has(remote.status)) {
      const processed = await this.markFailed(payment.id, remote.status);
      // vencida: remove a cobrança no Asaas para não ser paga depois (boleto/Pix vencido ainda pode ser pago)
      if (remote.status === 'OVERDUE') await this.asaas.cancelPayment(remote.id);
      return { action: 'failed', processed };
    }
    if (ASAAS_REFUNDED_STATUSES.has(remote.status)) {
      return { action: 'refunded', processed: await this.markRefunded(payment.id) };
    }
    if (remote.status.startsWith('CHARGEBACK')) {
      await this.flagForReview(payment.id, 'CHARGEBACK', `Asaas ${remote.id}: chargeback (${remote.status}) — verificar no painel`);
      return { action: 'chargeback', status: remote.status };
    }
    return { action: 'none', status: remote.status };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Mensalidade — cobranças geradas pela assinatura no Asaas
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Garante a linha Payment (purpose MEMBERSHIP) de uma cobrança da assinatura e aplica o status.
   * Usado pelo webhook (PAYMENT_CREATED/RECEIVED/…), pela reconciliação e pela assinatura inicial.
   * O valor gravado é o do gateway; se ≠ preço travado da mensalidade → AMOUNT_MISMATCH (não ativa).
   */
  async ingestMembershipRemotePayment(membership: MembershipForBilling, remote: AsaasPayment, source: MarkPaidSource) {
    if (membership.externalSubscriptionId && remote.subscription && remote.subscription !== membership.externalSubscriptionId) {
      this.logger.error(`Cobrança Asaas ${remote.id} é da assinatura ${remote.subscription}, não de ${membership.externalSubscriptionId}`);
      return { ignored: 'subscription-mismatch' };
    }
    const row = await this.upsertMembershipPayment(membership, remote);
    return this.applyMembershipAsaasStatus(row, membership, remote, source);
  }

  /** Cria (ou devolve) a linha Payment de uma cobrança da assinatura. Idempotente por externalPaymentId. */
  async upsertMembershipPayment(
    membership: MembershipForBilling,
    remote: AsaasPayment,
    extra: { id?: string; accessTokenHash?: string | null } = {},
  ) {
    const amount = Math.round(Number(remote.value) * 100);
    const due = dateFromAsaas(remote.dueDate);
    const mismatch = amount !== membership.priceInCents;
    const row = await this.prisma.payment.upsert({
      where: { externalPaymentId: remote.id },
      create: {
        ...(extra.id ? { id: extra.id } : {}),
        userId: membership.athleteId,
        purpose: PaymentPurpose.MEMBERSHIP,
        membershipId: membership.id,
        teamId: membership.teamId,
        amount,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.ASAAS,
        method: remote.billingType ?? 'UNDEFINED',
        externalPaymentId: remote.id,
        checkoutUrl: remote.invoiceUrl ?? remote.bankSlipUrl ?? null,
        expiresAt: due,
        accessTokenHash: extra.accessTokenHash ?? null,
        failureReason: mismatch ? 'AMOUNT_MISMATCH' : null,
      },
      update: {
        // fatura/vencimento podem mudar no Asaas (ex.: troca de plano com updatePendingPayments)
        ...(remote.invoiceUrl ? { checkoutUrl: remote.invoiceUrl } : {}),
        ...(due ? { expiresAt: due } : {}),
      },
    });
    if (mismatch && row.failureReason === 'AMOUNT_MISMATCH') {
      this.logger.error(`[REVISAR PAGAMENTO ${row.id}] AMOUNT_MISMATCH: mensalidade ${membership.id} cobrança ${remote.id} ${remote.value} ≠ ${membership.priceInCents / 100}`);
    }
    return row;
  }

  /**
   * Transições da mensalidade a partir do status da cobrança no gateway:
   *  RECEIVED/CONFIRMED → markPaid (→ ACTIVE + período) · OVERDUE → PAST_DUE só após a carência
   *  (dentro dela continua ACTIVE com a cobrança sinalizada OVERDUE) · DELETED → FAILED ·
   *  REFUNDED → REFUNDED (sinalizado, mensalidade inalterada) · CHARGEBACK_* → revisão.
   * Nunca cancela a cobrança vencida no gateway (mensalidade atrasada continua pagável).
   */
  private async applyMembershipAsaasStatus(
    payment: { id: string; amount: number; failureReason?: string | null },
    membership: MembershipForBilling,
    remote: AsaasPayment,
    source: MarkPaidSource,
  ) {
    if (membership.externalSubscriptionId && remote.subscription && remote.subscription !== membership.externalSubscriptionId) {
      await this.flagForReview(payment.id, 'REFERENCE_MISMATCH', `Asaas ${remote.id}: assinatura ${remote.subscription} ≠ ${membership.externalSubscriptionId}`);
      return { ignored: 'reference-mismatch' };
    }
    const remoteCents = Math.round(Number(remote.value) * 100);
    if (remoteCents !== payment.amount || payment.failureReason === 'AMOUNT_MISMATCH') {
      await this.flagForReview(payment.id, 'AMOUNT_MISMATCH', `Asaas ${remote.id}: valor ${remote.value} ≠ ${payment.amount / 100} (mensalidade ${membership.id}, status ${remote.status})`);
      return { ignored: 'amount-mismatch' };
    }
    if (ASAAS_PAID_STATUSES.has(remote.status)) {
      const r = await this.markPaid(payment.id, source);
      return { action: 'paid', processed: r.processed, outcome: r.outcome };
    }
    if (remote.status === 'OVERDUE') {
      return { action: 'overdue', ...(await this.membershipOverdue(payment.id, membership, dateFromAsaas(remote.dueDate))) };
    }
    if (remote.status === 'DELETED') {
      return { action: 'failed', processed: await this.markFailed(payment.id, 'DELETED') };
    }
    if (ASAAS_REFUNDED_STATUSES.has(remote.status)) {
      const processed = await this.markRefunded(payment.id);
      if (processed) this.logger.warn(`Mensalidade ${membership.id}: cobrança ${payment.id} estornada — equipe deve revisar o acesso`);
      return { action: 'refunded', processed };
    }
    if (remote.status.startsWith('CHARGEBACK')) {
      await this.flagForReview(payment.id, 'CHARGEBACK', `Asaas ${remote.id}: chargeback (${remote.status}) na mensalidade ${membership.id}`);
      return { action: 'chargeback', status: remote.status };
    }
    return { action: 'none', status: remote.status };
  }

  /** Cobrança vencida: sinaliza a cobrança e só marca PAST_DUE depois da carência da equipe. */
  async membershipOverdue(paymentId: string, membership: MembershipForBilling, dueDate: Date | null, now = new Date()) {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { failureReason: 'OVERDUE', ...(dueDate ? { expiresAt: dueDate } : {}) },
    });
    const graceDays = membership.team?.graceDays ?? 5;
    const due = dueDate ?? now;
    if (!isBeyondGrace(due, graceDays, now)) return { pastDue: false, inGrace: true };
    if (membership.status !== MembershipStatus.ACTIVE) return { pastDue: false, inGrace: false };
    const upd = await this.prisma.athleteMembership.updateMany({
      where: { id: membership.id, status: MembershipStatus.ACTIVE },
      data: { status: MembershipStatus.PAST_DUE },
    });
    return { pastDue: upd.count === 1, inGrace: false };
  }

  /** Eventos checkout.session.* do Stripe (assinatura já verificada no controller). */
  async handleStripeCheckoutEvent(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session?.metadata?.paymentId;
    if (!paymentId) return { received: true, ignored: 'no-metadata' };
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.provider !== PaymentProvider.STRIPE || payment.externalPaymentId !== session.id) {
      this.logger.warn(`Stripe ${event.type}: sessão ${session.id} não corresponde ao pagamento ${paymentId}`);
      return { received: true, ignored: 'mismatch' };
    }
    const kind =
      event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed' ? 'expired' : 'completed';
    return { received: true, ...(await this.applyStripeSession(payment, session, kind)) };
  }

  private async applyStripeSession(
    payment: { id: string; amount: number },
    session: Stripe.Checkout.Session,
    kind: 'completed' | 'expired',
  ) {
    if (kind === 'expired') return { action: 'failed', processed: await this.markFailed(payment.id, 'STRIPE_EXPIRED') };
    if (session.payment_status !== 'paid') return { action: 'none', status: session.payment_status };
    if (session.amount_total !== payment.amount || (session.currency ?? '').toLowerCase() !== 'brl') {
      await this.flagForReview(payment.id, 'AMOUNT_MISMATCH', `Stripe ${session.id}: valor ${session.amount_total} ${session.currency} ≠ ${payment.amount} brl`);
      return { ignored: 'amount-mismatch' };
    }
    const r = await this.markPaid(payment.id, 'STRIPE');
    return { action: 'paid', processed: r.processed };
  }

  /** Marca o pagamento para revisão manual (não muda o status; não dispara retry do gateway). */
  async flagForReview(paymentId: string, reason: 'AMOUNT_MISMATCH' | 'REFERENCE_MISMATCH' | 'CHARGEBACK', message: string) {
    this.logger.error(`[REVISAR PAGAMENTO ${paymentId}] ${reason}: ${message}`);
    await this.prisma.payment
      .update({ where: { id: paymentId }, data: { failureReason: reason } })
      .catch((e) => this.logger.error(`Falha ao sinalizar pagamento ${paymentId}: ${e?.message}`));
  }

  /**
   * charge.refunded / charge.dispute.* do Stripe (cobranças do Checkout Session).
   * O paymentId vem do metadata do PaymentIntent (copiado na criação da sessão).
   */
  async handleStripeChargeEvent(event: Stripe.Event) {
    const obj: any = event.data.object;
    const charge: Stripe.Charge | null = event.type.startsWith('charge.dispute') ? null : (obj as Stripe.Charge);
    const paymentIntentId: string | undefined =
      typeof obj?.payment_intent === 'string' ? obj.payment_intent : obj?.payment_intent?.id;
    let paymentId: string | undefined = obj?.metadata?.paymentId;
    if (!paymentId && paymentIntentId && this.stripe.isConfigured) {
      paymentId = (await this.stripe.retrievePaymentIntentMetadata(paymentIntentId))?.paymentId;
    }
    if (!paymentId) return { received: true, ignored: 'no-metadata' };
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.provider !== PaymentProvider.STRIPE) return { received: true, ignored: 'unknown-payment' };

    if (event.type.startsWith('charge.dispute')) {
      await this.flagForReview(payment.id, 'CHARGEBACK', `Stripe ${event.type} (${obj?.id}) — contestação aberta`);
      return { received: true, action: 'chargeback' };
    }
    if (charge?.refunded) {
      return { received: true, action: 'refunded', processed: await this.markRefunded(payment.id) };
    }
    this.logger.warn(`Stripe ${event.type}: estorno parcial em ${payment.id} (${charge?.amount_refunded}/${charge?.amount}) — revisar`);
    return { received: true, action: 'partial-refund' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Expiração (job do scheduler)
  // ════════════════════════════════════════════════════════════════════════

  async expireStale(now = new Date()) {
    const toCancelAtGateway: Array<{ provider: string; externalPaymentId: string | null }> = [];
    const promoted: Array<{ registrationId: string; requiresPayment: boolean }> = [];
    let orders = 0;
    let registrations = 0;

    const staleOrders = await this.prisma.storeOrder.findMany({
      where: { status: StoreOrderStatus.PENDING_PAYMENT, expiresAt: { lt: now } },
      select: { id: true },
      take: 200,
    });
    for (const o of staleOrders) {
      try {
        const r = await this.prisma.$transaction((tx) => this.fulfillment.releaseStoreOrder(tx, o.id, 'EXPIRED', now));
        if (r.released) {
          orders++;
          toCancelAtGateway.push(...r.closedPayments);
        }
      } catch (e: any) {
        this.logger.error(`Falha ao expirar pedido ${o.id}: ${e?.message}`);
      }
    }

    const staleRegs = await this.prisma.eventRegistration.findMany({
      where: { status: EventRegistrationStatus.PENDING, paymentExpiresAt: { lt: now } },
      select: { id: true, eventId: true },
      take: 200,
    });
    for (const r of staleRegs) {
      try {
        const res = await this.prisma.$transaction(async (tx) => {
          await this.fulfillment.lockEvent(tx, r.eventId);
          const released = await this.fulfillment.releaseEventRegistration(tx, r.id, {
            paymentStatus: PaymentStatus.FAILED,
            failureReason: 'EXPIRED',
          });
          if (!released) return null;
          const promotedReg = await this.fulfillment.promoteWaitlist(tx, r.eventId, now);
          await this.fulfillment.refreshSoldOut(tx, r.eventId, now);
          return { released, promotedReg };
        });
        if (res) {
          registrations++;
          toCancelAtGateway.push(...res.released.closedPayments);
          if (res.promotedReg) {
            promoted.push({ registrationId: res.promotedReg.registration.id, requiresPayment: res.promotedReg.requiresPayment });
          }
        }
      } catch (e: any) {
        this.logger.error(`Falha ao expirar inscrição ${r.id}: ${e?.message}`);
      }
    }

    const plans = await this.prisma.payment.updateMany({
      where: { purpose: PaymentPurpose.PLATFORM_PLAN, status: PaymentStatus.PENDING, expiresAt: { lt: now } },
      data: { status: PaymentStatus.FAILED, failureReason: 'EXPIRED' },
    });

    // Cancela no gateway para o cliente não conseguir pagar uma reserva já liberada
    for (const p of toCancelAtGateway) {
      if (p.provider === PaymentProvider.ASAAS && p.externalPaymentId) await this.asaas.cancelPayment(p.externalPaymentId);
      if (p.provider === PaymentProvider.STRIPE && p.externalPaymentId && this.stripe.isConfigured) {
        await this.stripe.expireCheckoutSession(p.externalPaymentId);
      }
    }
    for (const p of promoted) await this.notifyPromotion(p.registrationId, p.requiresPayment).catch(() => undefined);

    // Crédito de indicação preso em cobranças que falharam/expiraram/foram substituídas volta ao saldo
    await settleCreditReservations(this.prisma).catch((e) => this.logger.warn(`Reservas de crédito: ${e?.message ?? e}`));

    if (orders || registrations || plans.count) {
      this.logger.log(`Expiração: ${orders} pedido(s), ${registrations} inscrição(ões), ${plans.count} cobrança(s) de plano`);
    }
    return { orders, registrations, platformPayments: plans.count, promoted: promoted.length };
  }

  async notifyPromotion(registrationId: string, requiresPayment: boolean) {
    if (!requiresPayment) return this.sendRegistrationConfirmed(registrationId, 0);
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { event: { select: { id: true, title: true } }, user: { select: { email: true, name: true } } },
    });
    if (reg?.user.email && reg.paymentExpiresAt) {
      await this.email.sendEventSpotAvailable(reg.user.email, {
        name: reg.user.name,
        eventTitle: reg.event.title,
        eventId: reg.event.id,
        expiresAt: reg.paymentExpiresAt,
      });
    }
  }

  /** Cancela cobranças pendentes no gateway (usado quando o coach/atleta cancela). */
  async cancelAtGateway(payments: Array<{ provider: string; externalPaymentId: string | null }>) {
    for (const p of payments) {
      if (p.provider === PaymentProvider.ASAAS && p.externalPaymentId) await this.asaas.cancelPayment(p.externalPaymentId);
      if (p.provider === PaymentProvider.STRIPE && p.externalPaymentId && this.stripe.isConfigured) {
        await this.stripe.expireCheckoutSession(p.externalPaymentId);
      }
    }
  }
}
