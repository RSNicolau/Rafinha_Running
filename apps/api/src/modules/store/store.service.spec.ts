import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { StoreService } from './store.service';
import { FulfillmentService } from '../payments/checkout/fulfillment.service';
import { sha256 } from '../payments/checkout/checkout.service';
import { CreateStoreOrderDto, UpdateProductDto } from './dto/store.dto';

const PRODUCT = {
  id: '11111111-1111-4111-8111-111111111111', coachId: 'coach-1', name: 'Camisa', priceInCents: 10000, active: true,
  sizes: ['P', 'M'], colors: [], totalStock: 5, reserved: 0, athleteDiscountPercent: 20,
  isPreOrder: false, preOrderDeadline: null, preOrderLimit: null, estimatedDelivery: null,
};

function setup(overrides: Partial<typeof PRODUCT> = {}) {
  const product = { ...PRODUCT, ...overrides };
  const coupons: Record<string, any> = {};
  const orders: any[] = [];
  const prisma: any = {
    product: { findUnique: jest.fn().mockResolvedValue(product), update: jest.fn(), findFirst: jest.fn() },
    athleteProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    storeCoupon: {
      findUnique: jest.fn(async ({ where }: any) => coupons[where.coachId_code.code] ?? null),
      findMany: jest.fn(async ({ where }: any) => Object.values(coupons).filter((c: any) => c.code === where.code)),
      // semântica do Postgres: WHERE reavaliado atomicamente na linha
      updateMany: jest.fn(async ({ where }: any) => {
        const c = Object.values(coupons).find((x: any) => x.id === where.id) as any;
        if (!c || !c.isActive) return { count: 0 };
        if (where.usedCount?.lt !== undefined && !(c.usedCount < where.usedCount.lt)) return { count: 0 };
        c.usedCount += 1;
        return { count: 1 };
      }),
      update: jest.fn(),
    },
    storeOrder: {
      create: jest.fn(async ({ data }: any) => {
        const o = { id: `ord-${orders.length + 1}`, createdAt: new Date(), ...data };
        orders.push(o);
        return o;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...orders.find((o) => o.id === where.id), product: { name: product.name, estimatedDelivery: null } })),
      findUnique: jest.fn(async ({ where }: any) => orders.find((o) => o.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(orders.find((o) => o.id === where.id), data)),
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const o = orders.find((x) => x.id === where.id && (!where.status || x.status === where.status));
        if (!o) return { count: 0 };
        Object.assign(o, data);
        return { count: 1 };
      }),
    },
    payment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const fulfillment = new FulfillmentService(prisma);
  const checkout: any = { cancelAtGateway: jest.fn() };
  const email: any = { sendStoreOrderPaid: jest.fn().mockResolvedValue(undefined), sendStoreOrderStatus: jest.fn().mockResolvedValue(undefined) };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue({}) };
  const svc = new StoreService(prisma, fulfillment, checkout, email, notifications);
  return { svc, prisma, coupons, orders, product, email, checkout };
}

const baseDto = (extra: Partial<CreateStoreOrderDto> = {}): CreateStoreOrderDto => ({
  productId: PRODUCT.id, customerName: 'Maria Silva', customerEmail: 'maria@x.com', quantity: 1, size: 'M', ...extra,
});

describe('StoreService', () => {
  describe('DTO validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    it('rejects quantity > 10 and < 1 and non-integers', async () => {
      for (const quantity of [0, 11, 1.5]) {
        await expect(pipe.transform({ ...baseDto(), quantity }, { type: 'body', metatype: CreateStoreOrderDto })).rejects.toBeInstanceOf(BadRequestException);
      }
    });
    it('rejects client-sent price/total fields', async () => {
      await expect(
        pipe.transform({ ...baseDto(), totalInCents: 1 }, { type: 'body', metatype: CreateStoreOrderDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('updateProduct whitelist: coachId / reserved cannot be changed', async () => {
      for (const forbidden of [{ coachId: 'other' }, { reserved: 0 }]) {
        await expect(pipe.transform({ name: 'X', ...forbidden }, { type: 'body', metatype: UpdateProductDto })).rejects.toBeInstanceOf(BadRequestException);
      }
    });
    it('requires an address for SHIPPING', async () => {
      await expect(
        pipe.transform({ ...baseDto(), deliveryMethod: 'SHIPPING' }, { type: 'body', metatype: CreateStoreOrderDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createOrder', () => {
    it('reserves stock atomically and prices server-side (guest: no athlete discount)', async () => {
      const { svc, prisma } = setup();
      const r = await svc.createOrder(baseDto({ quantity: 2 }), null);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // UPDATE ... WHERE total_stock - reserved >= qty
      expect(r).toMatchObject({ totalInCents: 20000, finalInCents: 20000, status: 'PENDING_PAYMENT', requiresPayment: true });
      expect(r.accessToken).toEqual(expect.any(String));
      const created = prisma.storeOrder.create.mock.calls[0][0].data;
      expect(created.accessTokenHash).toBe(sha256(r.accessToken));
      expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
      expect(r).not.toHaveProperty('customerEmail'); // sem PII na resposta pública
    });

    it('M4: at most 3 open unpaid orders per e-mail', async () => {
      const { svc, prisma } = setup();
      prisma.storeOrder.count.mockResolvedValue(3);
      await expect(svc.createOrder(baseDto(), null)).rejects.toThrow('aguardando pagamento');
      expect(prisma.$executeRaw).not.toHaveBeenCalled(); // nada reservado
      expect(prisma.storeOrder.count.mock.calls[0][0].where).toMatchObject({ customerEmail: 'maria@x.com', status: 'PENDING_PAYMENT' });
    });

    it('insufficient stock → 400', async () => {
      const { svc, prisma } = setup();
      prisma.$executeRaw.mockResolvedValue(0);
      await expect(svc.createOrder(baseDto({ quantity: 6 }), null)).rejects.toThrow('Estoque insuficiente');
    });

    it('athlete discount only for authenticated athletes of the product coach', async () => {
      const a = setup();
      a.prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach-1' });
      expect((await a.svc.createOrder(baseDto(), { id: 'ath-1' })).finalInCents).toBe(8000);

      const b = setup();
      b.prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'another-coach' });
      expect((await b.svc.createOrder(baseDto(), { id: 'ath-2' })).finalInCents).toBe(10000);
    });

    it('rejects an expired coupon (expiresAt is enforced)', async () => {
      const { svc, coupons } = setup();
      coupons.OLD = { id: 'c-old', code: 'OLD', type: 'PERCENT', value: 10, maxUses: null, usedCount: 0, isActive: true, expiresAt: new Date('2020-01-01') };
      await expect(svc.createOrder(baseDto({ couponCode: 'old' }), null)).rejects.toThrow('Cupom expirado');
    });

    it('coupon race: 5 concurrent orders on a maxUses=2 coupon → exactly 2 succeed', async () => {
      const { svc, coupons } = setup({ totalStock: 100 });
      coupons.RUN10 = { id: 'c1', code: 'RUN10', type: 'PERCENT', value: 10, maxUses: 2, usedCount: 0, isActive: true, expiresAt: null };
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => svc.createOrder(baseDto({ couponCode: 'RUN10' }), null)));
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(ok).toHaveLength(2);
      expect(failed).toHaveLength(3);
      failed.forEach((f) => expect(String(f.reason.message)).toMatch(/limite de usos/));
      expect(coupons.RUN10.usedCount).toBe(2);
      ok.forEach((r: any) => expect(r.value.finalInCents).toBe(9000));
    });

    it('courtesy coupon (100%) → order paid immediately, stock moved reserved→sold', async () => {
      const { svc, coupons, prisma, email } = setup();
      coupons.VIP = { id: 'c2', code: 'VIP', type: 'COURTESY', value: 0, maxUses: 1, usedCount: 0, isActive: true, expiresAt: null };
      const r = await svc.createOrder(baseDto({ couponCode: 'VIP' }), null);
      expect(r.status).toBe('PAID');
      expect(r.requiresPayment).toBe(false);
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: PRODUCT.id }, data: { totalStock: { decrement: 1 }, reserved: { decrement: 1 } } });
      expect(email.sendStoreOrderPaid).toHaveBeenCalled();
    });

    it('pre-order: no stock reservation, but limit enforced under product lock', async () => {
      const { svc, prisma } = setup({ isPreOrder: true, totalStock: 0, preOrderLimit: 10 } as any);
      prisma.storeOrder.aggregate.mockResolvedValue({ _sum: { quantity: 9 } });
      await expect(svc.createOrder(baseDto({ quantity: 2 }), null)).rejects.toThrow('Limite de encomendas atingido');
      expect(prisma.$queryRaw).toHaveBeenCalled(); // SELECT ... FOR UPDATE
      expect(prisma.$executeRaw).not.toHaveBeenCalled();

      prisma.storeOrder.aggregate.mockResolvedValue({ _sum: { quantity: 8 } });
      const ok = await svc.createOrder(baseDto({ quantity: 2 }), null);
      expect(ok.isPreOrder).toBe(true);
    });

    it('pre-order after deadline → 400', async () => {
      const { svc } = setup({ isPreOrder: true, preOrderDeadline: new Date('2020-01-01') } as any);
      await expect(svc.createOrder(baseDto(), null)).rejects.toThrow('prazo de encomenda');
    });

    it('invalid size → 400', async () => {
      const { svc } = setup();
      await expect(svc.createOrder(baseDto({ size: 'XG' }), null)).rejects.toThrow('tamanho');
    });
  });

  describe('getPublicOrder', () => {
    it('requires the order token and never returns PII', async () => {
      const { svc, prisma } = setup();
      const order = {
        id: 'ord-x', athleteId: null, accessTokenHash: sha256('tok'), status: 'PAID', quantity: 1, totalInCents: 100, discountInCents: 0,
        finalInCents: 100, customerName: 'Maria', customerEmail: 'm@x.com', customerPhone: '219', shippingAddress: 'Rua', product: { name: 'Camisa' },
      };
      prisma.storeOrder.findUnique.mockResolvedValue(order);
      await expect(svc.getPublicOrder('ord-x', undefined, null)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getPublicOrder('ord-x', 'bad', null)).rejects.toBeInstanceOf(NotFoundException);
      const r: any = await svc.getPublicOrder('ord-x', 'tok', null);
      expect(r.productName).toBe('Camisa');
      for (const k of ['customerName', 'customerEmail', 'customerPhone', 'shippingAddress', 'accessTokenHash']) expect(r).not.toHaveProperty(k);
    });
  });

  describe('updateOrderStatus', () => {
    it('rejects invalid transitions', async () => {
      const { svc, prisma } = setup();
      prisma.storeOrder.findFirst.mockResolvedValue({ id: 'o', status: 'DELIVERED', product: { name: 'Camisa' } });
      await expect(svc.updateOrderStatus('o', { id: 'coach-1' }, { status: 'PROCESSING' as any })).rejects.toThrow('Transição inválida');
    });

    it('cancelling a pending order releases the reservation and cancels gateway charges', async () => {
      const { svc, prisma, checkout } = setup();
      prisma.storeOrder.findFirst.mockResolvedValue({ id: 'o', status: 'PENDING_PAYMENT', product: { name: 'Camisa' } });
      prisma.storeOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.storeOrder.findUnique.mockResolvedValue({ id: 'o', productId: PRODUCT.id, quantity: 1, isPreOrder: false, couponId: null, status: 'CANCELLED', customerEmail: 'm@x.com', customerName: 'M', athleteId: null });
      prisma.payment.findMany.mockResolvedValue([{ id: 'p', provider: 'ASAAS', externalPaymentId: 'a1' }]);
      await svc.updateOrderStatus('o', { id: 'coach-1' }, { status: 'CANCELLED' as any });
      expect(checkout.cancelAtGateway).toHaveBeenCalledWith([{ id: 'p', provider: 'ASAAS', externalPaymentId: 'a1' }]);
    });

    it('H2: coach manual mark-paid on an order already paid by the gateway → 409, stock untouched', async () => {
      const { svc, prisma } = setup();
      prisma.storeOrder.findFirst.mockResolvedValue({ id: 'o', status: 'PENDING_PAYMENT', product: { name: 'Camisa' } }); // tela desatualizada
      prisma.storeOrder.findUnique.mockResolvedValue({ id: 'o', productId: PRODUCT.id, quantity: 1, isPreOrder: false, status: 'PAID', finalInCents: 10000, totalInCents: 10000, discountInCents: 0 });
      prisma.storeOrder.updateMany.mockResolvedValue({ count: 0 }); // o webhook já fez PENDING → PAID
      await expect(svc.updateOrderStatus('o', { id: 'coach-1' }, { status: 'PAID' as any })).rejects.toThrow('já foi pago');
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('coach scope: another coach cannot see the order', async () => {
      const { svc, prisma } = setup();
      prisma.storeOrder.findFirst.mockResolvedValue(null);
      await expect(svc.updateOrderStatus('o', { id: 'intruder' }, { status: 'SHIPPED' as any })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.storeOrder.findFirst.mock.calls[0][0].where).toEqual({ id: 'o', product: { coachId: 'intruder' } });
    });
  });
});

/**
 * Fake de teamMember que entende as consultas do escopo de conteúdo (ownership.ts):
 * userId/teamId (string ou {in}), isActive, role.in, orderBy createdAt e select team.status.
 */
export function teamMemberFake(rows: Array<{ teamId: string; userId: string; role: string; isActive?: boolean; at?: number }>) {
  const all = rows.map((r, i) => ({ isActive: true, ...r, createdAt: new Date(2026, 0, 1 + (r.at ?? i)), team: { status: 'ACTIVE' } }));
  const match = (v: any, x: any) => v === undefined || (typeof v === 'object' && v !== null && 'in' in v ? v.in.includes(x) : v === x);
  const filter = (where: any = {}) =>
    all
      .filter((m) => match(where.userId, m.userId) && match(where.teamId, m.teamId) && (where.isActive === undefined || m.isActive === where.isActive) && (!where.role?.in || where.role.in.includes(m.role)))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    findMany: jest.fn(async ({ where }: any = {}) => filter(where)),
    findFirst: jest.fn(async ({ where }: any = {}) => filter(where)[0] ?? null),
  };
}

describe('StoreService — escopo da equipe', () => {
  function teamPrisma(extra: Array<{ teamId: string; userId: string; role: string; isActive?: boolean; at?: number }> = []) {
    const members = [
      { teamId: 'T1', userId: 'owner-1', role: 'OWNER', at: 0 },
      { teamId: 'T1', userId: 'coach-1', role: 'COACH', at: 1 },
      { teamId: 'T1', userId: 'coach-2', role: 'COACH', at: 2 },
      ...extra,
    ];
    const prisma: any = {
      product: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0), update: jest.fn() },
      storeOrder: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: {} }), groupBy: jest.fn().mockResolvedValue([]) },
      storeCoupon: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => data), update: jest.fn(async ({ data }: any) => data) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      coachProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      team: { findFirst: jest.fn().mockResolvedValue(null) },
      athleteProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      teamMember: teamMemberFake(members),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const svc = new StoreService(prisma, {} as any, { cancelAtGateway: jest.fn() } as any, {} as any, {} as any);
    return { svc, prisma };
  }
  const OWNER_T1 = { teamId: 'T1', role: 'OWNER' };

  it('OWNER da equipe vê produtos, pedidos e cupons dos treinadores da equipe ATIVA', async () => {
    const { svc, prisma } = teamPrisma();
    await svc.listCoachProducts('owner-1', 'COACH', OWNER_T1);
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] } });
    await svc.listCoachOrders({ id: 'owner-1', role: 'COACH', team: OWNER_T1 });
    expect(prisma.storeOrder.findMany.mock.calls[0][0].where.product).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] } });
    await svc.listStoreCoupons({ id: 'owner-1', role: 'COACH', team: OWNER_T1 });
    expect(prisma.storeCoupon.findMany.mock.calls[0][0].where).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] } });
  });

  it('sem header: usa a equipe padrão (mesma regra do TeamContextService)', async () => {
    const { svc, prisma } = teamPrisma();
    await svc.listCoachProducts('owner-1', 'COACH');
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] } });
  });

  it('COACH vê apenas os próprios itens; ADMIN da plataforma vê tudo', async () => {
    const { svc, prisma } = teamPrisma();
    await svc.listCoachProducts('coach-1', 'COACH', { teamId: 'T1', role: 'COACH' });
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: 'coach-1' });
    await svc.listCoachProducts('adm', 'ADMIN');
    expect(prisma.product.findMany.mock.calls[1][0].where).toEqual({});
  });

  it('OWNER gerencia produto de outro treinador da equipe; COACH não', async () => {
    const { svc, prisma } = teamPrisma();
    await expect(svc.deleteProduct('p1', { id: 'coach-1', role: 'COACH', team: { teamId: 'T1', role: 'COACH' } })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', coachId: 'coach-1' });
    await expect(svc.deleteProduct('p1', { id: 'owner-1', role: 'COACH', team: OWNER_T1 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst.mock.calls[1][0].where).toEqual({ id: 'p1', coachId: { in: ['owner-1', 'coach-1', 'coach-2'] } });
  });

  it('vitrine pública por slug da EQUIPE lista produtos atribuídos à equipe', async () => {
    const { svc, prisma } = teamPrisma();
    prisma.team.findFirst.mockResolvedValue({ id: 'T1', ownerId: 'owner-1' });
    await svc.listPublicProducts('rafinha');
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] }, active: true });
  });

  it('vitrine pública por slug legado de treinador continua só dele', async () => {
    const { svc, prisma } = teamPrisma();
    prisma.coachProfile.findFirst.mockResolvedValue({ userId: 'coach-2' });
    await svc.listPublicProducts('coach-dois');
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: 'coach-2', active: true });
  });

  // ── Regressão QA C1: treinador X é COACH na Rafinha (T1) e depois entra na equipe 2 (T2) ──
  describe('C1 — treinador em duas equipes', () => {
    const extra = [
      { teamId: 'T1', userId: 'coach-x', role: 'COACH', at: 3 },
      { teamId: 'T2', userId: 'owner-2', role: 'OWNER', at: 4 },
      { teamId: 'T2', userId: 'coach-x', role: 'COACH', at: 5 },
    ];
    const OWNER_T2 = { teamId: 'T2', role: 'OWNER' };

    it('dono da equipe 2 NÃO vê produtos, pedidos (PII) nem cupons criados por X na Rafinha', async () => {
      const { svc, prisma } = teamPrisma(extra);
      await svc.listCoachProducts('owner-2', 'COACH', OWNER_T2);
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: 'owner-2' });
      await svc.listCoachOrders({ id: 'owner-2', role: 'COACH', team: OWNER_T2 });
      expect(prisma.storeOrder.findMany.mock.calls[0][0].where.product).toEqual({ coachId: 'owner-2' });
      await svc.exportOrdersCsv({ id: 'owner-2', role: 'COACH', team: OWNER_T2 });
      expect(prisma.storeOrder.findMany.mock.calls[1][0].where.product).toEqual({ coachId: 'owner-2' });
      await svc.listStoreCoupons({ id: 'owner-2', role: 'COACH', team: OWNER_T2 });
      expect(prisma.storeCoupon.findMany.mock.calls[0][0].where).toEqual({ coachId: 'owner-2' });
    });

    it('dono da equipe 2 não consegue alterar o preço do produto de X (404)', async () => {
      const { svc, prisma } = teamPrisma(extra);
      await expect(svc.updateProduct('prod-x', { id: 'owner-2', role: 'COACH', team: OWNER_T2 }, { priceInCents: 1 })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.findFirst.mock.calls[0][0].where).toEqual({ id: 'prod-x', coachId: 'owner-2' });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('dono da Rafinha continua vendo o conteúdo de X', async () => {
      const { svc, prisma } = teamPrisma(extra);
      await svc.listCoachProducts('owner-1', 'COACH', OWNER_T1);
      expect(prisma.product.findMany.mock.calls[0][0].where.coachId.in).toContain('coach-x');
    });

    it('vitrine pública da equipe 2 não mostra produtos de X; a da Rafinha mostra', async () => {
      const { svc, prisma } = teamPrisma(extra);
      prisma.team.findFirst.mockResolvedValueOnce({ id: 'T2', ownerId: 'owner-2' });
      await svc.listPublicProducts('equipe-dois');
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: 'owner-2', active: true });
      prisma.team.findFirst.mockResolvedValueOnce({ id: 'T1', ownerId: 'owner-1' });
      await svc.listPublicProducts('rafinha');
      expect(prisma.product.findMany.mock.calls[1][0].where.coachId.in).toEqual(expect.arrayContaining(['coach-x', 'owner-1']));
    });

    it('X não cria produto com a equipe 2 ativa (o conteúdo iria para a Rafinha) — 403', async () => {
      const { svc } = teamPrisma(extra);
      await expect(
        svc.createProduct('coach-x', { name: 'Camisa', category: 'APPAREL', priceInCents: 1000 } as any, { id: 'coach-x', role: 'COACH', team: { teamId: 'T2', role: 'COACH' } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('dono de equipe que também é COACH em outra: conteúdo dele fica na equipe que ele possui', async () => {
      const { svc, prisma } = teamPrisma([{ teamId: 'T2', userId: 'owner-2', role: 'OWNER', at: 9 }, { teamId: 'T1', userId: 'owner-2', role: 'COACH', at: 3 }]);
      await svc.listCoachProducts('owner-1', 'COACH', OWNER_T1);
      expect(prisma.product.findMany.mock.calls[0][0].where.coachId.in).not.toContain('owner-2');
    });

    it('treinador desativado da Rafinha não leva o histórico para a equipe nova', async () => {
      const { svc, prisma } = teamPrisma([
        { teamId: 'T1', userId: 'coach-x', role: 'COACH', isActive: false, at: 3 },
        { teamId: 'T2', userId: 'owner-2', role: 'OWNER', at: 4 },
        { teamId: 'T2', userId: 'coach-x', role: 'COACH', at: 5 },
      ]);
      await svc.listCoachOrders({ id: 'owner-2', role: 'COACH', team: { teamId: 'T2', role: 'OWNER' } });
      expect(prisma.storeOrder.findMany.mock.calls[0][0].where.product).toEqual({ coachId: 'owner-2' });
      await svc.listCoachOrders({ id: 'owner-1', role: 'COACH', team: OWNER_T1 });
      expect(prisma.storeOrder.findMany.mock.calls[1][0].where.product.coachId.in).toContain('coach-x');
    });
  });

  // ── A3: loja e desconto de aluno valem para toda a equipe ──
  describe('A3 — loja da equipe para o atleta', () => {
    it('atleta de outro treinador da mesma equipe vê os produtos da equipe', async () => {
      const { svc, prisma } = teamPrisma();
      prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach-2', teamId: 'T1' });
      await svc.listForAthlete('ath-20');
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ coachId: { in: ['owner-1', 'coach-1', 'coach-2'] }, active: true });
    });

    it('vitrine pública com atleta logado da equipe já traz o preço com desconto', async () => {
      const { svc, prisma } = teamPrisma();
      prisma.team.findFirst.mockResolvedValue({ id: 'T1', ownerId: 'owner-1' });
      prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach-2', teamId: 'T1' });
      prisma.product.findMany.mockResolvedValue([{ ...PRODUCT, coachId: 'owner-1', priceInCents: 14990, athleteDiscountPercent: 10 }]);
      const [p] = (await svc.listPublicProducts('rafinha', 'ath-20')) as any[];
      expect(p.finalPriceInCents).toBe(13491);
      expect(p.hasAthleteDiscount).toBe(true);
    });

    it('prévia do cupom usa a mesma base com desconto de aluno (checkout mostra o total real)', async () => {
      const { svc, prisma } = teamPrisma();
      prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach-2', teamId: 'T1' });
      prisma.product.findFirst.mockResolvedValue({ priceInCents: 10000, athleteDiscountPercent: 20, coachId: 'owner-1' });
      prisma.storeCoupon.findMany.mockResolvedValue([{ id: 'c', code: 'DEZ', coachId: 'coach-1', type: 'PERCENT', value: 10, isActive: true, usedCount: 0, maxUses: null, expiresAt: null }]);
      const r = await svc.validateStoreCoupon({ coachId: 'rafinha', code: 'dez', productId: PRODUCT.id, quantity: 1 }, 'ath-20');
      expect(r.finalInCents).toBe(7200); // 100 → 80 (aluno) → 72 (cupom 10%)
    });
  });

  describe('cupons (B4 / B11) e publicação (M10)', () => {
    it('não cria cupom já expirado', async () => {
      const { svc } = teamPrisma();
      await expect(
        svc.createStoreCoupon('owner-1', { code: 'VELHO', type: 'PERCENT', value: 10, expiresAt: '2020-01-01T00:00:00Z' }, { id: 'owner-1', role: 'COACH', team: OWNER_T1 }),
      ).rejects.toThrow('data futura');
    });

    it('edita o valor do cupom validando o tipo', async () => {
      const { svc, prisma } = teamPrisma();
      prisma.storeCoupon.findFirst.mockResolvedValue({ id: 'c1', type: 'PERCENT', coachId: 'owner-1' });
      await expect(svc.updateStoreCoupon('c1', { id: 'owner-1', role: 'COACH', team: OWNER_T1 }, { value: 150 })).rejects.toBeInstanceOf(BadRequestException);
      await svc.updateStoreCoupon('c1', { id: 'owner-1', role: 'COACH', team: OWNER_T1 }, { value: 15 });
      expect(prisma.storeCoupon.update.mock.calls[0][0].data.value).toBe(15);
    });

    it('COACH cria produto inativo e não publica; STAFF não cria', async () => {
      const { svc, prisma } = teamPrisma();
      prisma.product.create = jest.fn(async ({ data }: any) => data);
      const created: any = await svc.createProduct('coach-1', { name: 'Boné', category: 'ACCESSORY', priceInCents: 5000, active: true } as any, { id: 'coach-1', role: 'COACH', team: { teamId: 'T1', role: 'COACH' } });
      expect(created.active).toBe(false);
      prisma.product.findFirst.mockResolvedValue({ id: 'p', coachId: 'coach-1', active: false, reserved: 0 });
      await expect(svc.updateProduct('p', { id: 'coach-1', role: 'COACH', team: { teamId: 'T1', role: 'COACH' } }, { active: true })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        svc.createProduct('staff', { name: 'X', category: 'ACCESSORY', priceInCents: 5000 } as any, { id: 'staff', role: 'COACH', team: { teamId: 'T1', role: 'STAFF' } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
