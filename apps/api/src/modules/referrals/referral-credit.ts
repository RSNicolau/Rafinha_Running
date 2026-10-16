/**
 * Crédito de indicação (User.referralCreditCents) usado como desconto em cobranças do atleta
 * (mensalidade — 1ª cobrança avulsa — e checkout da loja/eventos).
 *
 * Ciclo de vida (sem coluna nova no schema: a reserva fica em AppConfig `credit_reservation:<paymentId>`):
 *   RESERVED  — ao criar a cobrança: o saldo é debitado atomicamente (não pode ser usado duas vezes)
 *               e a cobrança sai com (valor − crédito), mínimo R$5.
 *   CONSUMED  — no markPaid (pagamento confirmado).
 *   RELEASED  — cobrança falhou/expirou/foi substituída (ou estornada): o saldo volta ao atleta.
 * Uma reserva em aberto por atleta: enquanto houver cobrança PENDING com crédito, outro checkout não usa crédito
 * (a mesma cobrança, ao ser reaproveitada, mantém o mesmo crédito).
 */
export const CREDIT_RESERVATION_PREFIX = 'credit_reservation:';
/** Valor mínimo de uma cobrança no Asaas (centavos). */
export const MIN_CHARGE_AFTER_CREDIT_CENTS = 500;

export type CreditState = 'RESERVED' | 'CONSUMED' | 'RELEASED';
export interface CreditReservation {
  userId: string;
  paymentId: string;
  cents: number;
  refKey: string;
  state: CreditState;
  at?: string;
}

const keyOf = (paymentId: string) => `${CREDIT_RESERVATION_PREFIX}${paymentId}`;

export async function getCreditReservation(prisma: any, paymentId: string): Promise<CreditReservation | null> {
  if (!paymentId || !prisma?.appConfig?.findUnique) return null;
  const row = await prisma.appConfig.findUnique({ where: { key: keyOf(paymentId) } });
  const v = row?.value as CreditReservation | undefined;
  return v && typeof v.cents === 'number' ? v : null;
}

/** Centavos de crédito embutidos na cobrança (para conferir valor no fulfillment e calcular descontos). */
export async function creditCentsOf(prisma: any, paymentId: string): Promise<number> {
  return (await getCreditReservation(prisma, paymentId))?.cents ?? 0;
}

/** Transição atômica de estado (updateMany condicional pelo estado atual no JSON). */
async function transition(prisma: any, paymentId: string, from: CreditState, to: CreditState, r: CreditReservation): Promise<boolean> {
  const upd = await prisma.appConfig.updateMany({
    where: { key: keyOf(paymentId), value: { path: ['state'], equals: from } },
    data: { value: { ...r, state: to, at: new Date().toISOString() } },
  });
  return upd.count === 1;
}

/** Libera a reserva (saldo volta). includeConsumed: também desfaz um crédito já consumido (estorno). */
export async function releaseCredit(prisma: any, paymentId: string, opts: { includeConsumed?: boolean } = {}): Promise<number> {
  const r = await getCreditReservation(prisma, paymentId);
  if (!r) return 0;
  const from: CreditState[] = opts.includeConsumed ? ['RESERVED', 'CONSUMED'] : ['RESERVED'];
  if (!from.includes(r.state)) return 0;
  if (!(await transition(prisma, paymentId, r.state, 'RELEASED', r))) return 0;
  await prisma.user.update({ where: { id: r.userId }, data: { referralCreditCents: { increment: r.cents } } });
  return r.cents;
}

/**
 * Pagamento confirmado: RESERVED → CONSUMED. Se a reserva já tinha sido liberada (cobrança marcada como
 * falha e paga depois), tenta debitar de novo; sem saldo suficiente, registra e segue (o pagamento vale).
 */
export async function consumeCredit(prisma: any, paymentId: string, log?: (m: string) => void): Promise<number> {
  const r = await getCreditReservation(prisma, paymentId);
  if (!r || r.state === 'CONSUMED') return 0;
  if (r.state === 'RESERVED') return (await transition(prisma, paymentId, 'RESERVED', 'CONSUMED', r)) ? r.cents : 0;
  // RELEASED → re-debita
  const debit = await prisma.user.updateMany({
    where: { id: r.userId, referralCreditCents: { gte: r.cents } },
    data: { referralCreditCents: { decrement: r.cents } },
  });
  if (debit.count !== 1) {
    log?.(`Crédito de indicação da cobrança ${paymentId} já tinha sido devolvido e o saldo atual não cobre ${r.cents} — revisar`);
    return 0;
  }
  await transition(prisma, paymentId, 'RELEASED', 'CONSUMED', r);
  return r.cents;
}

/** Reserva `cents` do saldo para a cobrança `paymentId` (débito atômico). Retorna o reservado (0 se sem saldo). */
export async function reserveCredit(prisma: any, userId: string, paymentId: string, cents: number, refKey: string): Promise<number> {
  if (!userId || !(cents > 0)) return 0;
  const run = async (tx: any) => {
    const debit = await tx.user.updateMany({
      where: { id: userId, referralCreditCents: { gte: cents } },
      data: { referralCreditCents: { decrement: cents } },
    });
    if (debit.count !== 1) return 0;
    const value: CreditReservation = { userId, paymentId, cents, refKey, state: 'RESERVED', at: new Date().toISOString() };
    await tx.appConfig.create({ data: { key: keyOf(paymentId), value } });
    return cents;
  };
  return prisma.$transaction ? prisma.$transaction((tx: any) => run(tx)) : run(prisma);
}

/** Reservas em aberto (RESERVED). userId opcional: sem ele varre todas (job de expiração). */
async function openReservations(prisma: any, userId?: string): Promise<CreditReservation[]> {
  if (!prisma?.appConfig?.findMany) return [];
  const rows = await prisma.appConfig.findMany({
    where: {
      key: { startsWith: CREDIT_RESERVATION_PREFIX },
      AND: [
        { value: { path: ['state'], equals: 'RESERVED' } },
        ...(userId ? [{ value: { path: ['userId'], equals: userId } }] : []),
      ],
    },
    take: 500,
  });
  return rows.map((r: any) => r.value as CreditReservation).filter((v: any) => v && typeof v.cents === 'number');
}

/**
 * Libera reservas cujas cobranças não estão mais pendentes (falha/expiração/substituição) e consome as
 * já pagas. Chamado no job de expiração e antes de cada novo uso de crédito. Retorna as ainda pendentes.
 */
export async function settleCreditReservations(prisma: any, userId?: string): Promise<CreditReservation[]> {
  const open = await openReservations(prisma, userId);
  const stillPending: CreditReservation[] = [];
  for (const r of open) {
    const p = await prisma.payment.findUnique({ where: { id: r.paymentId }, select: { status: true } });
    if (p?.status === 'PENDING') stillPending.push(r);
    else if (p?.status === 'SUCCEEDED') await consumeCredit(prisma, r.paymentId);
    else await releaseCredit(prisma, r.paymentId);
  }
  return stillPending;
}

/**
 * Quanto crédito aplicar numa nova cobrança de `amountInCents` para `refKey` (ex.: "STORE_ORDER:<id>").
 * - cobrança pendente com crédito para o MESMO item → mesmo valor (permite reaproveitar a cobrança);
 * - cobrança pendente com crédito para OUTRO item → 0 (uma reserva por vez);
 * - senão min(saldo, valor − R$5).
 */
export async function planCredit(prisma: any, userId: string | null | undefined, refKey: string, amountInCents: number) {
  const none = { cents: 0, pendingPaymentId: null as string | null };
  if (!userId || !(amountInCents > MIN_CHARGE_AFTER_CREDIT_CENTS) || !prisma?.appConfig) return none;
  const pending = await settleCreditReservations(prisma, userId);
  const same = pending.find((r) => r.refKey === refKey);
  if (same) return { cents: Math.min(same.cents, amountInCents - MIN_CHARGE_AFTER_CREDIT_CENTS), pendingPaymentId: same.paymentId };
  if (pending.length) return none;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCreditCents: true } });
  const balance = u?.referralCreditCents ?? 0;
  return { cents: Math.max(0, Math.min(balance, amountInCents - MIN_CHARGE_AFTER_CREDIT_CENTS)), pendingPaymentId: null };
}
