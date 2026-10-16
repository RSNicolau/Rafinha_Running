import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventsService, computeRegistrationPrice, parseRegistrationCode } from './events.service';
import { FulfillmentService } from '../payments/checkout/fulfillment.service';

const EVENT = {
  id: 'ev-1', createdById: 'coach-1', title: 'Corrida RR', status: 'PUBLISHED', price: 8000, maxParticipants: 100,
  kitCompletePrice: null as number | null, kitPremiumPrice: null as number | null, kitPickupDate: null,
  eventDate: new Date(Date.now() + 30 * 86400000),
};

function setup(eventOverrides: any = {}) {
  const event = { ...EVENT, ...eventOverrides };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    event: { findUnique: jest.fn().mockResolvedValue(event), update: jest.fn().mockResolvedValue({ bibSeq: 1 }) },
    eventRegistration: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: 'reg-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'reg-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventDistance: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    eventCoupon: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    eventCouponUse: { create: jest.fn(), deleteMany: jest.fn() },
    payment: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const fulfillment = new FulfillmentService(prisma);
  const checkout: any = { sendRegistrationConfirmed: jest.fn().mockResolvedValue(undefined), cancelAtGateway: jest.fn(), notifyPromotion: jest.fn() };
  const notifications: any = { createNotification: jest.fn() };
  const svc = new EventsService(prisma, fulfillment, checkout, notifications);
  return { svc, prisma, checkout, event };
}

describe('EventsService', () => {
  describe('pricing rule', () => {
    it('base = distance price (if > 0) else event price; + kit add-on', () => {
      const ev = { price: 8000, kitCompletePrice: 0, kitPremiumPrice: 4500 };
      expect(computeRegistrationPrice(ev, null, null)).toEqual({ base: 8000, kit: 0, subtotal: 8000 });
      expect(computeRegistrationPrice(ev, { price: 12000 }, 'PREMIUM' as any)).toEqual({ base: 12000, kit: 4500, subtotal: 16500 });
      expect(computeRegistrationPrice(ev, { price: 0 }, 'COMPLETO' as any)).toEqual({ base: 8000, kit: 0, subtotal: 8000 });
    });
    it('parses QR codes', () => {
      expect(parseRegistrationCode('RRKIT:0F8FAD5B-D9CB-469F-A165-70867728950E')).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
      expect(parseRegistrationCode('0042')).toBeNull();
    });
  });

  describe('register', () => {
    it('H5: a PAID event never confirms for free — PENDING, 30 min, no bib, requiresPayment', async () => {
      const { svc, prisma, checkout } = setup();
      const r: any = await svc.register('ev-1', 'ath-1', {});
      expect(r.status).toBe('PENDING');
      expect(r.paymentStatus).toBe('PENDING');
      expect(r.bibNumber).toBeNull();
      expect(r.requiresPayment).toBe(true);
      expect(r.amountInCents).toBe(8000);
      expect(r.paymentExpiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
      expect(prisma.$queryRaw).toHaveBeenCalled(); // lock FOR UPDATE do evento
      expect(checkout.sendRegistrationConfirmed).not.toHaveBeenCalled();
    });

    it('free event → CONFIRMED immediately with bib and e-mail', async () => {
      const { svc, checkout } = setup({ price: 0 });
      const r: any = await svc.register('ev-1', 'ath-1', {});
      expect(r.status).toBe('CONFIRMED');
      expect(r.paymentStatus).toBe('SUCCEEDED');
      expect(r.bibNumber).toBe('0001');
      expect(r.requiresPayment).toBe(false);
      expect(checkout.sendRegistrationConfirmed).toHaveBeenCalledWith('reg-1', 0);
    });

    it('courtesy coupon → CONFIRMED; coupon redeemed atomically', async () => {
      const { svc, prisma } = setup();
      prisma.eventCoupon.findUnique.mockResolvedValue({ id: 'c1', eventId: 'ev-1', type: 'COURTESY', value: 0, maxUses: 5, usedCount: 4, isActive: true, expiresAt: null });
      const r: any = await svc.register('ev-1', 'ath-1', { couponCode: 'vip' });
      expect(r.status).toBe('CONFIRMED');
      expect(prisma.eventCoupon.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'c1', usedCount: { lt: 5 } }) }));
      expect(prisma.eventCouponUse.create).toHaveBeenCalledWith({ data: { couponId: 'c1', registrationId: 'reg-1' } });
    });

    it('coupon race lost (limit reached concurrently) → 400', async () => {
      const { svc, prisma } = setup();
      prisma.eventCoupon.findUnique.mockResolvedValue({ id: 'c1', eventId: 'ev-1', type: 'PERCENT', value: 10, maxUses: 1, usedCount: 0, isActive: true, expiresAt: null });
      prisma.eventCoupon.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.register('ev-1', 'ath-1', { couponCode: 'X' })).rejects.toThrow('limite de usos');
    });

    it('expired coupon → 400', async () => {
      const { svc, prisma } = setup();
      prisma.eventCoupon.findUnique.mockResolvedValue({ id: 'c1', eventId: 'ev-1', type: 'PERCENT', value: 10, maxUses: null, usedCount: 0, isActive: true, expiresAt: new Date('2020-01-01') });
      await expect(svc.register('ev-1', 'ath-1', { couponCode: 'X' })).rejects.toThrow('Cupom expirado');
    });

    it('maxParticipants counts CONFIRMED + non-expired PENDING; full → WAITLIST without charge', async () => {
      const { svc, prisma } = setup({ maxParticipants: 2 });
      prisma.eventRegistration.count.mockResolvedValue(2);
      const r: any = await svc.register('ev-1', 'ath-1', {});
      expect(r.status).toBe('WAITLIST');
      expect(r.requiresPayment).toBe(false);
      expect(r.waitlisted).toBe(true);
      expect(prisma.eventCoupon.updateMany).not.toHaveBeenCalled();
      const where = prisma.eventRegistration.count.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('PENDING');
    });

    it('distance price + premium kit computed server-side', async () => {
      const { svc, prisma } = setup({ kitCompletePrice: 0, kitPremiumPrice: 4500 });
      prisma.eventDistance.count.mockResolvedValue(1);
      prisma.eventDistance.findUnique.mockResolvedValue({ id: 'd1', eventId: 'ev-1', isActive: true, price: 12000, maxParticipants: 10, registeredCount: 3 });
      const r: any = await svc.register('ev-1', 'ath-1', { distanceId: 'd1', kitType: 'PREMIUM' as any });
      expect(r.amountInCents).toBe(16500);
      expect(prisma.eventDistance.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { registeredCount: { increment: 1 } } });
    });

    it('requires a distance when the event has distances', async () => {
      const { svc, prisma } = setup();
      prisma.eventDistance.count.mockResolvedValue(2);
      await expect(svc.register('ev-1', 'ath-1', {})).rejects.toThrow('Escolha um percurso');
    });

    it('distance sold out → 400', async () => {
      const { svc, prisma } = setup();
      prisma.eventDistance.count.mockResolvedValue(1);
      prisma.eventDistance.findUnique.mockResolvedValue({ id: 'd1', eventId: 'ev-1', isActive: true, price: 0, maxParticipants: 3, registeredCount: 3 });
      await expect(svc.register('ev-1', 'ath-1', { distanceId: 'd1' })).rejects.toThrow('esgotadas');
    });

    it('resumes an existing pending registration (idempotent) and blocks duplicates', async () => {
      const a = setup();
      a.prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'reg-9', status: 'PENDING', finalPrice: 8000, paymentExpiresAt: new Date(Date.now() + 60000) });
      const r: any = await a.svc.register('ev-1', 'ath-1', {});
      expect(r.id).toBe('reg-9');
      expect(r.requiresPayment).toBe(true);

      const b = setup();
      b.prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'reg-9', status: 'CONFIRMED' });
      await expect(b.svc.register('ev-1', 'ath-1', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('draft events are not open for registration', async () => {
      const { svc } = setup({ status: 'DRAFT' });
      await expect(svc.register('ev-1', 'ath-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('management permissions', () => {
    it('only the creator or an admin can manage', async () => {
      const { svc } = setup();
      await expect(svc.assertCanManage('ev-1', { id: 'other', role: 'COACH' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.assertCanManage('ev-1', { id: 'adm', role: 'ADMIN' })).resolves.toBeTruthy();
    });

    it('presence endpoint cannot be used to confirm a pending (unpaid) registration', async () => {
      const { svc, prisma } = setup();
      prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'r', eventId: 'ev-1', status: 'PENDING' });
      await expect(svc.updateRegistrationStatus('ev-1', 'r', { id: 'coach-1' }, 'CONFIRMED' as any)).rejects.toThrow('ações de pagamento');
    });

    it('MARK_PAID by the organizer confirms with bib', async () => {
      const { svc, prisma, checkout } = setup();
      prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'r', eventId: 'ev-1', status: 'PENDING', bibNumber: null, finalPrice: 8000, registeredAt: new Date() });
      await svc.registrationPaymentAction('ev-1', 'r', { id: 'coach-1' }, 'MARK_PAID');
      expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r', status: 'PENDING' }, data: expect.objectContaining({ status: 'CONFIRMED', bibNumber: '0001' }) }));
      expect(checkout.sendRegistrationConfirmed).toHaveBeenCalledWith('r', 8000);
    });
  });

  describe('kit delivery', () => {
    it('refuses to deliver a kit for an unpaid registration', async () => {
      const { svc, prisma } = setup();
      (prisma as any).kitDeliverySession = { findUnique: jest.fn().mockResolvedValue({ eventId: 'ev-1', label: 'Vol', expiresAt: new Date(Date.now() + 60000) }) };
      prisma.eventRegistration.findUnique.mockResolvedValue({ id: '0f8fad5b-d9cb-469f-a165-70867728950e', eventId: 'ev-1', status: 'PENDING', paymentStatus: 'PENDING', kitDeliveredAt: null, user: { name: 'Ana' } });
      const r = await svc.deliverKit('RRKIT:0f8fad5b-d9cb-469f-a165-70867728950e', 'tok');
      expect(r.success).toBe(false);
    });
  });
});

function teamMemberFake(rows: Array<{ teamId: string; userId: string; role: string; isActive?: boolean; at?: number }>) {
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

describe('EventsService — escopo da equipe', () => {
  const members = [
    { teamId: 'T1', userId: 'owner-1', role: 'OWNER', at: 0 },
    { teamId: 'T1', userId: 'coach-1', role: 'COACH', at: 1 },
    { teamId: 'T1', userId: 'coach-2', role: 'COACH', at: 2 },
    // C1: coach-1 também entra na equipe 2 depois
    { teamId: 'T2', userId: 'owner-2', role: 'OWNER', at: 3 },
    { teamId: 'T2', userId: 'coach-1', role: 'COACH', at: 4 },
  ];
  function withTeam(eventOverrides: any = {}) {
    const ctx = setup(eventOverrides);
    ctx.prisma.teamMember = teamMemberFake(members);
    ctx.prisma.event.findMany = jest.fn().mockResolvedValue([]);
    ctx.prisma.event.create = jest.fn(async ({ data }: any) => data);
    return ctx;
  }
  const T1 = (role: string) => ({ teamId: 'T1', role });
  const T2 = (role: string) => ({ teamId: 'T2', role });

  it('OWNER gerencia evento criado por treinador da equipe; outro COACH não', async () => {
    const { svc } = withTeam(); // evento criado por coach-1
    await expect(svc.assertCanManage('ev-1', { id: 'owner-1', role: 'COACH', team: T1('OWNER') })).resolves.toBeTruthy();
    await expect(svc.assertCanManage('ev-1', { id: 'owner-1', role: 'COACH' })).resolves.toBeTruthy();
    await expect(svc.assertCanManage('ev-1', { id: 'coach-2', role: 'COACH', team: T1('COACH') })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertCanManage('ev-1', { id: 'coach-1', role: 'COACH' })).resolves.toBeTruthy();
    await expect(svc.assertCanManage('ev-1', { id: 'adm', role: 'SUPER_ADMIN' })).resolves.toBeTruthy();
  });

  it('listManaged: OWNER vê eventos da equipe ATIVA; COACH só os seus', async () => {
    const { svc, prisma } = withTeam();
    await svc.listManaged({ id: 'owner-1', role: 'COACH', team: T1('OWNER') });
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ createdById: { in: ['owner-1', 'coach-1', 'coach-2'] } });
    await svc.listManaged({ id: 'coach-2', role: 'COACH', team: T1('COACH') });
    expect(prisma.event.findMany.mock.calls[1][0].where).toEqual({ createdById: 'coach-2' });
    await svc.listManaged({ id: 'adm', role: 'ADMIN' });
    expect(prisma.event.findMany.mock.calls[2][0].where).toEqual({});
  });

  describe('C1 — treinador em duas equipes', () => {
    it('dono da equipe 2 não lista, não vê inscrições e não edita o evento criado por coach-1 na Rafinha', async () => {
      const { svc, prisma } = withTeam();
      await svc.listManaged({ id: 'owner-2', role: 'COACH', team: T2('OWNER') });
      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ createdById: 'owner-2' });
      await expect(svc.getRegistrations('ev-1', { id: 'owner-2', role: 'COACH', team: T2('OWNER') })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update('ev-1', { id: 'owner-2', role: 'COACH', team: T2('OWNER') }, { price: 1 } as any)).rejects.toBeInstanceOf(ForbiddenException);
      // mesmo sem header (equipe padrão) continua bloqueado
      await expect(svc.assertCanManage('ev-1', { id: 'owner-2', role: 'COACH' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('rascunho da Rafinha não aparece para o dono da equipe 2 (404)', async () => {
      const { svc } = withTeam({ status: 'DRAFT' });
      await expect(svc.findById('ev-1', { id: 'owner-2', role: 'COACH', team: T2('OWNER') })).rejects.toThrow('Evento não encontrado');
    });

    it('dono da Rafinha com a equipe 2 selecionada não gerencia evento da Rafinha (escopo = equipe ativa)', async () => {
      const ctx = setup();
      ctx.prisma.teamMember = teamMemberFake([...members, { teamId: 'T2', userId: 'owner-1', role: 'ADMIN', at: 9 }]);
      await expect(ctx.svc.assertCanManage('ev-1', { id: 'owner-1', role: 'COACH', team: T2('ADMIN') })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('M10 — publicação', () => {
    it('COACH cria rascunho, não publica; OWNER publica', async () => {
      const { svc } = withTeam({ status: 'DRAFT', createdById: 'coach-2' });
      await expect(svc.create('coach-2', { title: 'X', eventDate: new Date().toISOString(), status: 'PUBLISHED' } as any, { id: 'coach-2', role: 'COACH', team: T1('COACH') })).rejects.toBeInstanceOf(ForbiddenException);
      const created: any = await svc.create('coach-2', { title: 'X', eventDate: new Date().toISOString() } as any, { id: 'coach-2', role: 'COACH', team: T1('COACH') });
      expect(created.status).toBe('DRAFT');
      await expect(svc.update('ev-1', { id: 'coach-2', role: 'COACH', team: T1('COACH') }, { status: 'PUBLISHED' } as any)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update('ev-1', { id: 'owner-1', role: 'COACH', team: T1('OWNER') }, { status: 'PUBLISHED' } as any)).resolves.toBeTruthy();
    });
  });
});

describe('EventsService — cupons e check-in', () => {
  it('M1: cupom fixo valida contra o maior preço aplicável (percursos), não contra o preço base 0', async () => {
    const { svc, prisma } = setup({ price: 0 });
    prisma.eventDistance.findMany = jest.fn().mockResolvedValue([{ price: 6000 }, { price: 8050 }]);
    prisma.eventCoupon.create = jest.fn(async ({ data }: any) => data);
    await expect(svc.createCoupon('ev-1', { id: 'coach-1', role: 'COACH' }, { code: 'FIX10', type: 'FIXED', value: 1000 } as any)).resolves.toMatchObject({ value: 1000 });
    await expect(svc.createCoupon('ev-1', { id: 'coach-1', role: 'COACH' }, { code: 'FIX99', type: 'FIXED', value: 9000 } as any)).rejects.toThrow('R$ 80,50');
  });

  it('B4: cupom já expirado é recusado', async () => {
    const { svc } = setup();
    await expect(svc.createCoupon('ev-1', { id: 'coach-1', role: 'COACH' }, { code: 'OLD', type: 'PERCENT', value: 10, expiresAt: '2020-01-01T00:00:00Z' } as any)).rejects.toThrow('data futura');
  });

  it('B6: check-in mais de 1 dia antes da prova pede confirmação; com force registra', async () => {
    const { svc, prisma } = setup();
    prisma.eventRegistration.findFirst.mockResolvedValue({ id: 'reg-1', status: 'CONFIRMED', user: { name: 'Ana' }, bibNumber: '0001' });
    prisma.eventRegistration.update = jest.fn(async () => ({ id: 'reg-1', user: { name: 'Ana' }, bibNumber: '0001' }));
    const r: any = await svc.checkinScan('ev-1', { id: 'coach-1', role: 'COACH' }, '0001');
    expect(r.requiresConfirmation).toBe(true);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
    const ok: any = await svc.checkinScan('ev-1', { id: 'coach-1', role: 'COACH' }, '0001', true);
    expect(ok.success).toBe(true);
  });

  it('B7: republicar evento lotado recalcula SOLD_OUT', async () => {
    const { svc, prisma } = setup({ status: 'DRAFT', maxParticipants: 1 });
    prisma.event.update = jest.fn().mockResolvedValue({ id: 'ev-1', status: 'PUBLISHED' });
    const spy = jest.spyOn((svc as any).fulfillment, 'refreshSoldOut').mockResolvedValue(undefined);
    await svc.update('ev-1', { id: 'coach-1', role: 'COACH' }, { status: 'PUBLISHED' } as any);
    expect(spy).toHaveBeenCalled();
  });
});

describe('EventsService — autocancelamento e check-in (reteste)', () => {
  it('R4: inscrição CONFIRMED paga (valor > 0 + Payment SUCCEEDED) → 409; nada é liberado', async () => {
    const { svc, prisma, checkout } = setup();
    prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'reg-1', eventId: 'ev-1', userId: 'ath-1', status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', finalPrice: 8000 });
    prisma.payment.findFirst = jest.fn().mockResolvedValue({ id: 'pay-1' });
    await expect(svc.cancelRegistration('ev-1', 'ath-1')).rejects.toThrow('Inscrição paga — fale com a organização para cancelar/reembolsar');
    expect(prisma.payment.findFirst.mock.calls[0][0].where).toMatchObject({ eventRegistrationId: 'reg-1', purpose: 'EVENT_REGISTRATION' });
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    expect(checkout.cancelAtGateway).not.toHaveBeenCalled();
  });

  it('R4: gratuita/cortesia (paymentStatus SUCCEEDED, sem Payment), PENDING, WAITLIST e valor>0 sem pagamento confirmado → cancela', async () => {
    for (const reg of [
      { status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', finalPrice: 0 },
      { status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', finalPrice: null },
      { status: 'CONFIRMED', paymentStatus: 'PENDING', finalPrice: 8000 },
      { status: 'PENDING', paymentStatus: 'PENDING', finalPrice: 8000 },
      { status: 'WAITLIST', paymentStatus: null, finalPrice: 8000 },
    ]) {
      const { svc, prisma } = setup();
      prisma.payment.findFirst = jest.fn().mockResolvedValue(null);
      prisma.eventRegistration.findUnique.mockResolvedValue({ id: 'reg-1', eventId: 'ev-1', userId: 'ath-1', distanceId: null, couponId: null, ...reg });
      await svc.cancelRegistration('ev-1', 'ath-1').catch((e: any) => {
        throw new Error(`${reg.status}/${reg.finalPrice}: ${e.message}`);
      });
      if (!reg.finalPrice || reg.status !== 'CONFIRMED') expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    }
  });

  it('N3: peito desconhecido antes do dia da prova → 404 (não pede confirmação de data)', async () => {
    const { svc, prisma } = setup();
    prisma.eventRegistration.findFirst.mockResolvedValue(null);
    await expect(svc.checkinScan('ev-1', { id: 'coach-1', role: 'COACH' }, '9999')).rejects.toThrow('Inscrição não encontrada neste evento');
  });
});
