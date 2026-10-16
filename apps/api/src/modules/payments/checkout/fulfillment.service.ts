import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import {
  Prisma,
  EventRegistrationStatus,
  EventStatus,
  PaymentStatus,
  StoreOrderStatus,
  CoachSubscriptionStatus,
  PlatformPlanType,
  MembershipStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { addMonths, intervalMonths } from './membership.util';

export type Tx = Prisma.TransactionClient;

/** Tempo que um pedido/inscrição fica reservado aguardando pagamento. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;
/** Boleto / fatura com escolha de método: compensação pode levar dias. */
export const BOLETO_TTL_MS = Number(process.env.CHECKOUT_BOLETO_EXPIRATION_HOURS || 72) * 60 * 60 * 1000;
/** Ao liberar vaga da lista de espera em evento pago, o atleta tem este prazo para pagar. */
export const WAITLIST_PROMOTION_TTL_MS = 24 * 60 * 60 * 1000;

/** Inscrições que ocupam vaga (PENDING só enquanto não expirou). */
export const OCCUPYING_STATUSES: EventRegistrationStatus[] = [
  EventRegistrationStatus.CONFIRMED,
  EventRegistrationStatus.CHECKED_IN,
  EventRegistrationStatus.ABSENT,
];

/** Pedidos pagos cujo produto ainda não saiu (estorno devolve ao estoque). */
const RESTOCKABLE_ORDER_STATUSES: StoreOrderStatus[] = [
  StoreOrderStatus.PAID,
  StoreOrderStatus.CONFIRMED,
  StoreOrderStatus.PROCESSING,
  StoreOrderStatus.READY_FOR_PICKUP,
];

export type CouponLike = {
  id: string;
  type: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
};

export type FulfillmentOutcome = 'FULFILLED' | 'LATE_FULFILLED' | 'ALREADY' | 'NEEDS_REFUND';

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ════════════════════════════════════════════════════════════════════════
  // Helpers (puros / de transação)
  // ════════════════════════════════════════════════════════════════════════

  /** Desconto em centavos de um cupom PERCENT | FIXED (centavos) | COURTESY sobre `base`. */
  static couponDiscount(type: string, value: number, base: number): number {
    if (base <= 0) return 0;
    let d = 0;
    if (type === 'COURTESY') d = base;
    else if (type === 'PERCENT') d = Math.round((base * Math.min(Math.max(value, 0), 100)) / 100);
    else d = Math.round(Math.max(value, 0));
    return Math.min(d, base);
  }

  /** Retorna mensagem de erro se o cupom não pode ser usado agora; null se ok. */
  static couponProblem(coupon: CouponLike | null | undefined, now = new Date()): string | null {
    if (!coupon || !coupon.isActive) return 'Cupom inválido ou inativo';
    if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) return 'Cupom expirado';
    if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
      return 'Cupom atingiu o limite de usos';
    }
    return null;
  }

  /**
   * Resgate atômico: UPDATE ... SET used_count = used_count + 1 WHERE used_count < max_uses.
   * Em READ COMMITTED o Postgres reavalia o WHERE após o lock da linha, então dois
   * pedidos concorrentes nunca ultrapassam maxUses.
   */
  async redeemStoreCoupon(tx: Tx, coupon: CouponLike, now = new Date()): Promise<boolean> {
    const res = await tx.storeCoupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    return res.count === 1;
  }

  async redeemEventCoupon(tx: Tx, coupon: CouponLike, now = new Date()): Promise<boolean> {
    const res = await tx.eventCoupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    return res.count === 1;
  }

  /** Lock pessimista da linha do evento — serializa inscrições/confirmacões do mesmo evento. */
  async lockEvent(tx: Tx, eventId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE`;
  }

  async lockProduct(tx: Tx, productId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id" = ${productId} FOR UPDATE`;
  }

  /** Inscrições que ocupam vaga agora (confirmadas + pendentes não expiradas). */
  async countOccupying(tx: Tx, eventId: string, now = new Date()): Promise<number> {
    return tx.eventRegistration.count({
      where: {
        eventId,
        OR: [
          { status: { in: OCCUPYING_STATUSES } },
          {
            status: EventRegistrationStatus.PENDING,
            OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: now } }],
          },
        ],
      },
    });
  }

  /**
   * Número de peito único por evento. `bibSeq` é incrementado atomicamente na linha do
   * evento (lock de linha até o commit), e números legados já usados são pulados.
   * Formato mantido: 4 dígitos com zero à esquerda.
   */
  async assignBib(tx: Tx, eventId: string): Promise<string> {
    let resynced = false;
    for (let i = 0; i < 20; i++) {
      const ev = await tx.event.update({
        where: { id: eventId },
        data: { bibSeq: { increment: 1 } },
        select: { bibSeq: true },
      });
      const bib = String(ev.bibSeq).padStart(4, '0');
      const clash = await tx.eventRegistration.findFirst({
        where: { eventId, bibNumber: bib },
        select: { id: true },
      });
      if (!clash) return bib;
      if (!resynced) {
        // evento com números legados (gerados antes do bibSeq): pula direto para o maior já usado
        resynced = true;
        const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
          SELECT MAX(CAST("bib_number" AS INTEGER)) AS "max" FROM "event_registrations"
          WHERE "event_id" = ${eventId} AND "bib_number" ~ '^[0-9]+$'`;
        const max = Number(rows?.[0]?.max ?? 0);
        if (max > ev.bibSeq) await tx.event.update({ where: { id: eventId }, data: { bibSeq: max } });
      }
    }
    throw new ConflictException('Não foi possível gerar número de peito único. Tente novamente.');
  }

  async refreshSoldOut(tx: Tx, eventId: string, now = new Date()): Promise<void> {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { maxParticipants: true, status: true },
    });
    if (!event?.maxParticipants) return;
    const occupying = await this.countOccupying(tx, eventId, now);
    if (occupying >= event.maxParticipants && event.status === EventStatus.PUBLISHED) {
      await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.SOLD_OUT } });
    } else if (occupying < event.maxParticipants && event.status === EventStatus.SOLD_OUT) {
      await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.PUBLISHED } });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOJA
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Pedido pago: reservado → vendido. Pronta-entrega baixa `totalStock` e `reserved`;
   * encomenda não mexe em estoque (já contou no limite de encomendas na criação).
   *
   * Concorrência: lock da linha do pedido + transição condicional (PENDING_PAYMENT → PAID).
   * Só quem efetivamente faz a transição mexe no estoque; um segundo pagamento do mesmo
   * pedido recebe ALREADY (→ NEEDS_REFUND no markPaid).
   * Pagamento tardio (pedido expirado) tenta re-reservar; sem estoque → NEEDS_REFUND.
   * `payment` (quando vem do gateway) precisa ter o valor exato do pedido.
   */
  async storeOrderPaid(
    tx: Tx,
    orderId: string,
    now = new Date(),
    payment?: { amount: number } | null,
  ): Promise<{ outcome: FulfillmentOutcome; orderId: string }> {
    await tx.$queryRaw`SELECT "id" FROM "store_orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.storeOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const expected = order.finalInCents ?? order.totalInCents - order.discountInCents;
    if (payment && payment.amount !== expected) {
      this.logger.error(`Pedido ${orderId}: pagamento de ${payment.amount} ≠ valor do pedido ${expected}`);
      return { outcome: 'NEEDS_REFUND', orderId };
    }

    const paid = await tx.storeOrder.updateMany({
      where: { id: orderId, status: StoreOrderStatus.PENDING_PAYMENT },
      data: { status: StoreOrderStatus.PAID, paidAt: now, expiresAt: null, statusUpdatedAt: now },
    });
    if (paid.count === 1) {
      if (!order.isPreOrder) {
        await tx.product.update({
          where: { id: order.productId },
          data: {
            totalStock: { decrement: order.quantity },
            reserved: { decrement: order.quantity },
          },
        });
      }
      return { outcome: 'FULFILLED', orderId };
    }

    if (order.status === StoreOrderStatus.CANCELLED && order.cancelReason === 'EXPIRED') {
      // Pagamento chegou depois da expiração da reserva
      if (!order.isPreOrder) {
        const n = await tx.$executeRaw`
          UPDATE "products" SET "total_stock" = "total_stock" - ${order.quantity}, "updated_at" = NOW()
          WHERE "id" = ${order.productId} AND "total_stock" - "reserved" >= ${order.quantity}`;
        if (n === 0) return { outcome: 'NEEDS_REFUND', orderId };
      } else {
        const product = await tx.product.findUnique({ where: { id: order.productId } });
        if (product?.preOrderLimit) {
          await this.lockProduct(tx, order.productId);
          const agg = await tx.storeOrder.aggregate({
            where: {
              productId: order.productId,
              isPreOrder: true,
              status: { notIn: [StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED] },
            },
            _sum: { quantity: true },
          });
          if ((agg._sum.quantity ?? 0) + order.quantity > product.preOrderLimit) {
            return { outcome: 'NEEDS_REFUND', orderId };
          }
        }
      }
      const revived = await tx.storeOrder.updateMany({
        where: { id: orderId, status: StoreOrderStatus.CANCELLED, cancelReason: 'EXPIRED' },
        data: { status: StoreOrderStatus.PAID, paidAt: now, cancelReason: null, expiresAt: null, statusUpdatedAt: now },
      });
      if (revived.count === 0) throw new Error(`Pedido ${orderId} mudou de status durante a confirmação`);
      if (order.couponId) {
        // o cupom foi liberado na expiração; o cliente pagou o valor com desconto → honra
        await tx.storeCoupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
      }
      return { outcome: 'LATE_FULFILLED', orderId };
    }

    return { outcome: 'ALREADY', orderId };
  }

  /**
   * Libera um pedido aguardando pagamento: devolve a reserva e o uso do cupom.
   * Idempotente (só age se ainda estiver PENDING_PAYMENT). Retorna ids de pagamentos
   * pendentes que foram encerrados (para cancelar no gateway).
   */
  async releaseStoreOrder(
    tx: Tx,
    orderId: string,
    reason: 'EXPIRED' | 'COACH' | 'CUSTOMER',
    now = new Date(),
  ): Promise<{ released: boolean; closedPayments: Array<{ id: string; provider: string; externalPaymentId: string | null }> }> {
    const res = await tx.storeOrder.updateMany({
      where: { id: orderId, status: StoreOrderStatus.PENDING_PAYMENT },
      data: { status: StoreOrderStatus.CANCELLED, cancelReason: reason, expiresAt: null, statusUpdatedAt: now },
    });
    if (res.count === 0) return { released: false, closedPayments: [] };

    const order = await tx.storeOrder.findUnique({ where: { id: orderId } });
    if (order && !order.isPreOrder) {
      await tx.$executeRaw`
        UPDATE "products" SET "reserved" = GREATEST("reserved" - ${order.quantity}, 0), "updated_at" = NOW()
        WHERE "id" = ${order.productId}`;
    }
    if (order?.couponId) {
      await tx.storeCoupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
    // PENDING e também FAILED/OVERDUE: tudo que ainda pode ser pago no gateway é cancelado lá
    const open = await tx.payment.findMany({
      where: { storeOrderId: orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      select: { id: true, provider: true, externalPaymentId: true, status: true },
    });
    const pendingIds = open.filter((p) => p.status === PaymentStatus.PENDING).map((p) => p.id);
    if (pendingIds.length) {
      await tx.payment.updateMany({
        where: { id: { in: pendingIds }, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, failureReason: reason },
      });
    }
    return { released: true, closedPayments: open.map(({ id, provider, externalPaymentId }) => ({ id, provider, externalPaymentId })) };
  }

  /** Devolve ao estoque um pedido pago de pronta-entrega que ainda não saiu. */
  async restockPaidOrder(tx: Tx, order: { productId: string; quantity: number; isPreOrder: boolean; status: StoreOrderStatus }) {
    if (order.isPreOrder) return;
    if (!RESTOCKABLE_ORDER_STATUSES.includes(order.status)) return;
    await tx.product.update({
      where: { id: order.productId },
      data: { totalStock: { increment: order.quantity } },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Inscrição paga: PENDING → CONFIRMED, número de peito atribuído agora.
   *
   * - Lock do evento + lock da linha da inscrição e releitura (dois pagamentos concorrentes
   *   nunca geram dois peitos: o segundo vê CONFIRMED → ALREADY → NEEDS_REFUND).
   * - A cobrança precisa pertencer à tentativa atual: valor == finalPrice e criada depois de
   *   registeredAt (a linha eventId+userId é reaproveitada em nova inscrição) — senão NEEDS_REFUND.
   * - Inscrição CANCELED (expirada, cancelada pelo organizador ou estornada) nunca é reativada
   *   por pagamento: NEEDS_REFUND.
   */
  async eventRegistrationPaid(
    tx: Tx,
    registrationId: string,
    now = new Date(),
    externalPaymentId?: string | null,
    payment?: { amount: number; createdAt: Date } | null,
  ): Promise<{ outcome: FulfillmentOutcome; registrationId: string; bibNumber?: string | null }> {
    const first = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { eventId: true } });
    if (!first) throw new NotFoundException('Inscrição não encontrada');
    await this.lockEvent(tx, first.eventId);
    await tx.$queryRaw`SELECT "id" FROM "event_registrations" WHERE "id" = ${registrationId} FOR UPDATE`;
    const reg = await tx.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!reg) throw new NotFoundException('Inscrição não encontrada');

    if (payment) {
      const sameAttempt = payment.createdAt.getTime() >= reg.registeredAt.getTime();
      if (!sameAttempt || payment.amount !== (reg.finalPrice ?? -1)) {
        this.logger.error(
          `Inscrição ${registrationId}: cobrança de ${payment.amount} (${payment.createdAt.toISOString()}) não corresponde à tentativa atual (${reg.finalPrice} desde ${reg.registeredAt.toISOString()})`,
        );
        return { outcome: 'NEEDS_REFUND', registrationId };
      }
    }

    if (reg.status === EventRegistrationStatus.PENDING) {
      const bibNumber = reg.bibNumber ?? (await this.assignBib(tx, reg.eventId));
      const upd = await tx.eventRegistration.updateMany({
        where: { id: registrationId, status: EventRegistrationStatus.PENDING },
        data: {
          status: EventRegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.SUCCEEDED,
          confirmedAt: now,
          paymentExpiresAt: null,
          bibNumber,
          ...(externalPaymentId ? { externalPaymentId } : {}),
        },
      });
      if (upd.count === 0) throw new Error(`Inscrição ${registrationId} mudou de status durante a confirmação`);
      return { outcome: 'FULFILLED', registrationId, bibNumber };
    }

    // Legado: confirmada (ou já presente/ausente) com pagamento ainda pendente
    if ((OCCUPYING_STATUSES as string[]).includes(reg.status) && reg.paymentStatus !== PaymentStatus.SUCCEEDED) {
      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: { paymentStatus: PaymentStatus.SUCCEEDED, ...(externalPaymentId ? { externalPaymentId } : {}) },
      });
      return { outcome: 'FULFILLED', registrationId, bibNumber: reg.bibNumber };
    }

    // CONFIRMED já pago (pagamento duplicado), CANCELED, WAITLIST → estornar
    return { outcome: (OCCUPYING_STATUSES as string[]).includes(reg.status) ? 'ALREADY' : 'NEEDS_REFUND', registrationId };
  }

  /**
   * Cancela uma inscrição liberando vaga do percurso e uso do cupom.
   * Não toca em inscrições já canceladas. Retorna a inscrição anterior (ou null).
   */
  async releaseEventRegistration(
    tx: Tx,
    registrationId: string,
    opts: { paymentStatus?: PaymentStatus; failureReason?: string } = {},
  ) {
    const reg = await tx.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.status === EventRegistrationStatus.CANCELED) return null;

    const wasCounted = reg.status !== EventRegistrationStatus.WAITLIST;
    const paymentStatus =
      opts.paymentStatus ?? (reg.paymentStatus === PaymentStatus.SUCCEEDED ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED);

    await tx.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: EventRegistrationStatus.CANCELED,
        paymentStatus,
        paymentExpiresAt: null,
        couponId: null,
      },
    });

    if (wasCounted && reg.distanceId) {
      await tx.eventDistance.updateMany({
        where: { id: reg.distanceId, registeredCount: { gt: 0 } },
        data: { registeredCount: { decrement: 1 } },
      });
    }
    if (reg.couponId) {
      await tx.eventCoupon.updateMany({
        where: { id: reg.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      await tx.eventCouponUse.deleteMany({ where: { registrationId } });
    }
    const open = await tx.payment.findMany({
      where: { eventRegistrationId: registrationId, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      select: { id: true, provider: true, externalPaymentId: true, status: true },
    });
    const pendingIds = open.filter((p) => p.status === PaymentStatus.PENDING).map((p) => p.id);
    if (pendingIds.length) {
      await tx.payment.updateMany({
        where: { id: { in: pendingIds }, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, failureReason: opts.failureReason ?? 'CANCELED' },
      });
    }
    return { previous: reg, closedPayments: open.map(({ id, provider, externalPaymentId }) => ({ id, provider, externalPaymentId })) };
  }

  /**
   * Promove o primeiro da lista de espera se houver vaga.
   * Evento gratuito / inscrição com preço 0 → CONFIRMED com número de peito.
   * Evento pago → PENDING com 24h para pagar.
   */
  async promoteWaitlist(tx: Tx, eventId: string, now = new Date()) {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event?.maxParticipants) return null;
    if (event.status === EventStatus.CANCELED || event.status === EventStatus.COMPLETED) return null;
    const occupying = await this.countOccupying(tx, eventId, now);
    if (occupying >= event.maxParticipants) return null;

    const next = await tx.eventRegistration.findFirst({
      where: { eventId, status: EventRegistrationStatus.WAITLIST },
      orderBy: { registeredAt: 'asc' },
    });
    if (!next) return null;

    if (next.distanceId) {
      await tx.eventDistance.update({ where: { id: next.distanceId }, data: { registeredCount: { increment: 1 } } });
    }
    const price = next.finalPrice ?? event.price;
    if (price > 0) {
      const updated = await tx.eventRegistration.update({
        where: { id: next.id },
        data: {
          status: EventRegistrationStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          paymentExpiresAt: new Date(now.getTime() + WAITLIST_PROMOTION_TTL_MS),
        },
      });
      return { registration: updated, requiresPayment: true };
    }
    const bibNumber = await this.assignBib(tx, eventId);
    const updated = await tx.eventRegistration.update({
      where: { id: next.id },
      data: {
        status: EventRegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.SUCCEEDED,
        confirmedAt: now,
        bibNumber,
      },
    });
    return { registration: updated, requiresPayment: false };
  }

  // ════════════════════════════════════════════════════════════════════════
  // PLANO DA PLATAFORMA (coach assinando o SaaS)
  // ════════════════════════════════════════════════════════════════════════

  async platformPlanPaid(
    tx: Tx,
    payment: { userId: string | null; planId: string | null; externalPaymentId: string | null },
    now = new Date(),
  ): Promise<{ outcome: FulfillmentOutcome }> {
    if (!payment.userId || !payment.planId) return { outcome: 'NEEDS_REFUND' };
    if (!(Object.values(PlatformPlanType) as string[]).includes(payment.planId)) return { outcome: 'NEEDS_REFUND' };
    const plan = await tx.platformPlan.findUnique({ where: { type: payment.planId as PlatformPlanType } });
    if (!plan) return { outcome: 'NEEDS_REFUND' };

    const existing = await tx.coachSubscription.findUnique({ where: { coachId: payment.userId } });
    const extend =
      existing &&
      existing.status === CoachSubscriptionStatus.ACTIVE &&
      existing.planId === plan.id &&
      existing.currentPeriodEnd.getTime() > now.getTime();
    const periodStart = extend ? existing!.currentPeriodStart : now;
    const base = extend ? existing!.currentPeriodEnd : now;
    const periodEnd = new Date(base);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await tx.coachSubscription.upsert({
      where: { coachId: payment.userId },
      create: {
        coachId: payment.userId,
        planId: plan.id,
        status: CoachSubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        externalId: payment.externalPaymentId,
      },
      update: {
        planId: plan.id,
        status: CoachSubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        externalId: payment.externalPaymentId,
        whiteLabelId: null,
        trialEndsAt: null,
      },
    });
    return { outcome: 'FULFILLED' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // MENSALIDADE (atleta → equipe)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Cobrança da mensalidade paga → membership ACTIVE e período avançado.
   *
   * - Período: início = vencimento da cobrança (`payment.expiresAt` guarda o vencimento nas cobranças
   *   MEMBERSHIP; sem ele usa nextDueDate/agora), fim = início + periodicidade do plano.
   * - Fora de ordem / repetido: nunca recua o período (só avança se o novo fim for maior).
   * - Mensalidade CANCELED/PAUSED não é reativada por pagamento tardio → NEEDS_REFUND (equipe revisa).
   * Idempotência: garantida pelo markPaid (só a 1ª transição PENDING|FAILED → SUCCEEDED chega aqui).
   */
  async membershipPaid(
    tx: Tx,
    payment: { membershipId: string | null; expiresAt?: Date | null; amount: number },
    now = new Date(),
  ): Promise<{ outcome: FulfillmentOutcome; membershipId?: string }> {
    if (!payment.membershipId) return { outcome: 'NEEDS_REFUND' };
    await tx.$queryRaw`SELECT "id" FROM "athlete_memberships" WHERE "id" = ${payment.membershipId} FOR UPDATE`;
    const m = await tx.athleteMembership.findUnique({
      where: { id: payment.membershipId },
      include: { plan: { select: { interval: true } } },
    });
    if (!m) return { outcome: 'NEEDS_REFUND' };
    if (m.status === MembershipStatus.CANCELED || m.status === MembershipStatus.PAUSED) {
      this.logger.error(`Mensalidade ${m.id} (${m.status}) recebeu pagamento — revisar/estornar`);
      return { outcome: 'NEEDS_REFUND', membershipId: m.id };
    }

    const start = payment.expiresAt ?? m.nextDueDate ?? now;
    const end = addMonths(start, intervalMonths(m.plan?.interval));
    const advance = !m.currentPeriodEnd || end.getTime() > m.currentPeriodEnd.getTime();

    await tx.athleteMembership.update({
      where: { id: m.id },
      data: {
        status: MembershipStatus.ACTIVE,
        ...(advance ? { currentPeriodStart: start, currentPeriodEnd: end, nextDueDate: end } : {}),
      },
    });
    return { outcome: 'FULFILLED', membershipId: m.id };
  }
}
