import { StripeService } from './stripe.service';

/** M1: invoice.payment_failed seguido de invoice.paid da MESMA fatura não pode dar P2002 (loop de 500). */
describe('StripeService — subscription invoices (M1)', () => {
  function setup() {
    const rows: Record<string, any> = {};
    const prisma: any = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sub_local', userId: 'u1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: any) => rows[where.externalPaymentId] ?? null),
        create: jest.fn(async ({ data }: any) => {
          if (rows[data.externalPaymentId]) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
          rows[data.externalPaymentId] = { id: `p_${data.externalPaymentId}`, ...data };
          return rows[data.externalPaymentId];
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const r = Object.values(rows).find((x: any) => x.id === where.id) as any;
          return Object.assign(r, data);
        }),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const r = rows[where.externalPaymentId];
          if (r) return Object.assign(r, update);
          rows[where.externalPaymentId] = { id: `p_${where.externalPaymentId}`, ...create };
          return rows[where.externalPaymentId];
        }),
      },
    };
    return { svc: new StripeService(prisma), prisma, rows };
  }
  const inv = { id: 'in_1', subscription: 'sub_ext', amount_paid: 17400, amount_due: 17400 };

  it('failed then paid → single row SUCCEEDED and subscription ACTIVE (no P2002)', async () => {
    const { svc, prisma, rows } = setup();
    await svc.handleSubscriptionEvent({ type: 'invoice.payment_failed', data: { object: inv } } as any);
    await svc.handleSubscriptionEvent({ type: 'invoice.payment_failed', data: { object: inv } } as any); // retentativa
    await svc.handleSubscriptionEvent({ type: 'invoice.paid', data: { object: inv } } as any);
    expect(Object.keys(rows)).toEqual(['in_1']);
    expect(rows.in_1.status).toBe('SUCCEEDED');
    expect(prisma.subscription.update).toHaveBeenLastCalledWith({ where: { id: 'sub_local' }, data: { status: 'ACTIVE', gracePeriodEnd: null } });
  });

  it('a late payment_failed never downgrades a paid invoice', async () => {
    const { svc, rows } = setup();
    await svc.handleSubscriptionEvent({ type: 'invoice.paid', data: { object: inv } } as any);
    await svc.handleSubscriptionEvent({ type: 'invoice.payment_failed', data: { object: inv } } as any);
    expect(rows.in_1.status).toBe('SUCCEEDED');
  });
});
