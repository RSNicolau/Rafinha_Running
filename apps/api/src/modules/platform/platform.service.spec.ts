import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { WhiteLabelDto } from './dto/platform.dto';

function setup() {
  const prisma: any = {
    platformPlan: { findUnique: jest.fn() },
    coachSubscription: { findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn().mockResolvedValue(0), update: jest.fn() },
    whiteLabelAccount: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn() },
    athleteProfile: { count: jest.fn() },
  };
  const checkout: any = { createCheckout: jest.fn().mockResolvedValue({ paymentId: 'pay-1', accessToken: 't', checkoutUrl: 'https://inv' }) };
  return { svc: new PlatformService(prisma, checkout), prisma, checkout };
}

describe('PlatformService', () => {
  describe('subscribe (C4)', () => {
    it('paid plan does NOT activate — creates a PLATFORM_PLAN checkout and leaves the subscription untouched', async () => {
      const { svc, prisma, checkout } = setup();
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'pl', type: 'PRO', priceInCents: 39700, isActive: true });
      prisma.user.findUnique.mockResolvedValue({ name: 'Coach', email: 'c@c.com', phone: null });
      prisma.coachSubscription.findUnique.mockResolvedValue(null);

      const r: any = await svc.subscribe({ id: 'coach-1' }, { plan: 'PRO' as any, cpf: '52998224725' });
      expect(r.status).toBe('PENDING_PAYMENT');
      expect(prisma.coachSubscription.upsert).not.toHaveBeenCalled();
      expect(checkout.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        purpose: 'PLATFORM_PLAN', refId: 'PRO', userId: 'coach-1',
        buyer: expect.objectContaining({ name: 'Coach', email: 'c@c.com', cpf: '52998224725' }),
      }));
    });

    it('paid plan without CPF → 400', async () => {
      const { svc, prisma } = setup();
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'pl', type: 'PRO', priceInCents: 39700, isActive: true });
      await expect(svc.subscribe({ id: 'coach-1' }, { plan: 'PRO' as any })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('admin manual set still activates directly', async () => {
      const { svc, prisma } = setup();
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'pl', type: 'PRO' });
      await svc.adminSetPlan('coach-1', 'PRO' as any, 'ACTIVE' as any);
      expect(prisma.coachSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'ACTIVE' }) }));
    });
  });

  describe('white-label', () => {
    const owner = () => ({ plan: { type: 'WHITE_LABEL', maxCoaches: 10 }, status: 'ACTIVE' });

    it('DTO rejects maxCoaches / status / ownerId from the client', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      for (const extra of [{ maxCoaches: 999 }, { status: 'ACTIVE' }, { ownerId: 'x' }]) {
        await expect(pipe.transform({ brandName: 'Marca', ...extra }, { type: 'body', metatype: WhiteLabelDto })).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('maxCoaches comes from the plan on create and is never updated', async () => {
      const { svc, prisma } = setup();
      prisma.coachSubscription.findUnique.mockResolvedValue(owner());
      await svc.createWhiteLabel('owner-1', { brandName: 'Marca' });
      const arg = prisma.whiteLabelAccount.upsert.mock.calls[0][0];
      expect(arg.create.maxCoaches).toBe(10);
      expect(arg.update).not.toHaveProperty('maxCoaches');
    });

    it('cannot hijack a coach with an active subscription elsewhere → 409', async () => {
      const { svc, prisma } = setup();
      prisma.coachSubscription.findUnique
        .mockResolvedValueOnce(owner()) // dono
        .mockResolvedValueOnce({ status: 'ACTIVE', whiteLabelId: null }); // alvo paga o próprio plano
      prisma.whiteLabelAccount.findUnique.mockResolvedValue({ id: 'wl-1', status: 'ACTIVE', maxCoaches: 10 });
      prisma.user.findUnique.mockResolvedValue({ id: 'coach-2', role: 'COACH', deletedAt: null });
      await expect(svc.whiteLabelAddCoach('owner-1', 'coach-2')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coachSubscription.upsert).not.toHaveBeenCalled();
    });

    it('adds an unsubscribed coach', async () => {
      const { svc, prisma } = setup();
      prisma.coachSubscription.findUnique.mockResolvedValueOnce(owner()).mockResolvedValueOnce(null);
      prisma.whiteLabelAccount.findUnique.mockResolvedValue({ id: 'wl-1', status: 'ACTIVE', maxCoaches: 10 });
      prisma.user.findUnique.mockResolvedValue({ id: 'coach-2', role: 'COACH', deletedAt: null });
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'pro' });
      await svc.whiteLabelAddCoach('owner-1', 'coach-2');
      expect(prisma.coachSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ whiteLabelId: 'wl-1' }) }));
    });

    it('owner without an ACTIVE white-label plan is forbidden', async () => {
      const { svc, prisma } = setup();
      prisma.coachSubscription.findUnique.mockResolvedValue({ plan: { type: 'WHITE_LABEL' }, status: 'PAST_DUE' });
      await expect(svc.whiteLabelAddCoach('owner-1', 'coach-2')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('A2 — planos semeados na subida', () => {
    it('tabela vazia → cria todos os planos; tabela com planos → não mexe', async () => {
      const { svc, prisma } = setup();
      prisma.platformPlan.findMany = jest.fn().mockResolvedValue([]);
      prisma.platformPlan.createMany = jest.fn().mockResolvedValue({ count: 5 });
      expect(await svc.ensurePlansSeeded()).toBe(5);
      expect(prisma.platformPlan.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
      // base com só ELITE (seed antigo): cria os 4 que faltam, sem tocar no existente
      prisma.platformPlan.findMany.mockResolvedValue([{ type: 'ELITE' }]);
      expect(await svc.ensurePlansSeeded()).toBe(4);
      const created = prisma.platformPlan.createMany.mock.calls[1][0].data.map((p: any) => p.type);
      expect(created.sort()).toEqual(['PRO', 'SCALE', 'STARTER', 'WHITE_LABEL']);
      // completa → nada a criar
      prisma.platformPlan.findMany.mockResolvedValue(['STARTER', 'PRO', 'SCALE', 'ELITE', 'WHITE_LABEL'].map((type) => ({ type })));
      expect(await svc.ensurePlansSeeded()).toBe(0);
      expect(prisma.platformPlan.createMany).toHaveBeenCalledTimes(2);
      expect(prisma.platformPlan.update ?? jest.fn()).not.toHaveBeenCalled();
    });

    it('sem assinatura → período de teste informado (não bloqueia)', async () => {
      const { svc, prisma } = setup();
      prisma.coachSubscription.findUnique.mockResolvedValue(null);
      prisma.athleteProfile.count.mockResolvedValue(2);
      prisma.user.findUnique.mockResolvedValue({ createdAt: new Date() });
      const r: any = await svc.getMySubscription('c1');
      expect(r.status).toBe('NONE');
      expect(r.trial).toMatchObject({ implicit: true, maxAthletes: 5, expired: false });
    });
  });

  describe('A7 — domínio do white-label exige verificação', () => {
    function wl() {
      const ctx = setup();
      const store = new Map<string, any>();
      ctx.prisma.appConfig = {
        findUnique: jest.fn(async ({ where }: any) => (store.has(where.key) ? { value: store.get(where.key) } : null)),
        upsert: jest.fn(async ({ where, create, update }: any) => { store.set(where.key, store.has(where.key) ? update.value : create.value); return {}; }),
        delete: jest.fn(async ({ where }: any) => { store.delete(where.key); return {}; }),
      };
      ctx.prisma.coachSubscription.findUnique.mockResolvedValue({ status: 'ACTIVE', plan: { type: 'WHITE_LABEL', maxCoaches: 10 } });
      ctx.prisma.whiteLabelAccount.findUnique.mockResolvedValue({ id: 'wl-1', customDomain: null });
      ctx.prisma.whiteLabelAccount.upsert.mockImplementation(async ({ create }: any) => ({ id: 'wl-1', ...create }));
      ctx.prisma.whiteLabelAccount.updateMany = jest.fn();
      ctx.prisma.whiteLabelAccount.update = jest.fn(async ({ data }: any) => ({ id: 'wl-1', ...data }));
      return { ...ctx, store };
    }

    it('grava a conta sem o domínio e devolve o TXT a criar', async () => {
      const { svc, prisma } = wl();
      const r: any = await svc.createWhiteLabel('owner', { brandName: 'Marca', customDomain: 'app.marca.com.br' } as any);
      expect(prisma.whiteLabelAccount.upsert.mock.calls[0][0].create.customDomain).toBeNull();
      expect(prisma.whiteLabelAccount.upsert.mock.calls[0][0].update.customDomain).toBeUndefined();
      expect(r.pendingDomain.txtName).toBe('_rr-verify.app.marca.com.br');
    });

    it('verify ativa o domínio só com o TXT certo', async () => {
      const { svc, prisma } = wl();
      const r: any = await svc.createWhiteLabel('owner', { brandName: 'Marca', customDomain: 'app.marca.com.br' } as any);
      prisma.whiteLabelAccount.findUnique.mockResolvedValue({ id: 'wl-1' });
      svc.txtResolver = jest.fn().mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
      await expect(svc.verifyWhiteLabelDomain('owner')).rejects.toBeInstanceOf(BadRequestException);
      svc.txtResolver = jest.fn().mockResolvedValue([[r.pendingDomain.txtValue]]);
      const ok: any = await svc.verifyWhiteLabelDomain('owner');
      expect(ok.customDomain).toBe('app.marca.com.br');
    });

    it('domínio já verificado por outra conta → 409', async () => {
      const { svc, store } = wl();
      store.set('domain-verified:app.marca.com.br', { accountId: 'outro', kind: 'white-label' });
      await expect(svc.createWhiteLabel('owner', { brandName: 'Marca', customDomain: 'app.marca.com.br' } as any)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
