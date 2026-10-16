/**
 * Unit tests for OnboardingService.
 *
 * Uses mocked PrismaService, EmailService, and PaymentsService so no database
 * connection is required — safe to run in CI.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { MembershipsService } from '../memberships/memberships.service';
import { LegalService } from '../legal/legal.service';
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/legal.constants';
import { BadRequestException } from '@nestjs/common';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

// ── helpers ───────────────────────────────────────────────────────────────────

let lastTx: any;
function makeTx() {
  lastTx = {
    user: { create: jest.fn().mockResolvedValue({ id: 'new-ath', name: 'Novo', email: 'novo@x.com' }) },
    onboardingProfile: { create: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
  };
  return lastTx;
}

function makePrismaMock() {
  return {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    coachProfile: {
      findFirst: jest.fn(),
    },
    onboardingForm: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    onboardingQuestion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    onboardingProfile: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    aiJob: {
      create: jest.fn(),
    },
    athleteProfile: {
      create: jest.fn(),
    },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(makeTx()))),
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let emailService: { sendAthleteCredentials: jest.Mock; sendAthleteWelcome: jest.Mock; sendTransactional: jest.Mock; sendCoachNewAthleteAlert: jest.Mock };
  let legal: { assertCurrentVersions: jest.Mock; recordConsent: jest.Mock };
  let paymentsService: { createSubscription: jest.Mock };
  let referralsService: { linkRefereeOnSignup: jest.Mock };
  let memberships: { teamForAthlete: jest.Mock; subscribe: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    emailService = {
      sendAthleteCredentials: jest.fn().mockResolvedValue(undefined),
      sendAthleteWelcome: jest.fn().mockResolvedValue(undefined),
      sendTransactional: jest.fn().mockResolvedValue(undefined),
      sendCoachNewAthleteAlert: jest.fn().mockResolvedValue(undefined),
    };
    legal = {
      assertCurrentVersions: jest.fn((i: any) => {
        if (i.termsVersion !== TERMS_VERSION || i.privacyVersion !== PRIVACY_VERSION) throw new BadRequestException('v');
      }),
      recordConsent: jest.fn().mockResolvedValue(undefined),
    };
    paymentsService = {
      createSubscription: jest.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.example.com' }),
    };
    referralsService = {
      linkRefereeOnSignup: jest.fn().mockResolvedValue(undefined),
    };

    memberships = {
      teamForAthlete: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Rafinha Running' }),
      subscribe: jest.fn().mockResolvedValue({ membershipId: 'm-1', paymentId: 'pay-1', accessToken: 'tok', payPath: '/pedido/pay-1?token=tok' }),
    };
    (prisma as any).teamPlan = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'plan-m', name: 'Mensal', interval: 'MONTHLY', priceInCents: 17400 },
        { id: 'plan-t', name: 'Trimestral', interval: 'QUARTERLY', priceInCents: 49500 },
      ]),
    };
    (prisma as any).appConfig = { upsert: jest.fn().mockResolvedValue({}) };
    (prisma.user as any).update = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: MembershipsService, useValue: memberships },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: ReferralsService, useValue: referralsService },
        { provide: LegalService, useValue: legal },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  // ── getOrCreateForm ─────────────────────────────────────────────────────

  describe('getOrCreateForm()', () => {
    it('should return existing form for the coach', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1', questions: [] };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);

      const result = await service.getOrCreateForm('coach-1');

      expect(prisma.onboardingForm.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-1' } }),
      );
      expect(result).toEqual(mockForm);
      expect(prisma.onboardingForm.create).not.toHaveBeenCalled();
    });

    it('should create a new form with default questions when none exists', async () => {
      const mockForm = { id: 'form-2', coachId: 'coach-2', questions: [] };
      prisma.onboardingForm.findUnique.mockResolvedValue(null);
      prisma.onboardingForm.create.mockResolvedValue(mockForm);

      const result = await service.getOrCreateForm('coach-2');

      expect(prisma.onboardingForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coachId: 'coach-2',
            questions: expect.objectContaining({ create: expect.any(Array) }),
          }),
        }),
      );
      expect(result).toEqual(mockForm);
    });
  });

  // ── addQuestion ─────────────────────────────────────────────────────────

  describe('addQuestion()', () => {
    it('should throw NotFoundException when form does not exist', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValue(null);

      await expect(
        service.addQuestion('coach-x', { question: 'Test?', type: 'TEXT' as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create question with incremented order', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      const lastQuestion = { order: 5 };
      const newQuestion = { id: 'q-new', formId: 'form-1', order: 6, question: 'New Q?' };

      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.findFirst.mockResolvedValue(lastQuestion);
      prisma.onboardingQuestion.create.mockResolvedValue(newQuestion);

      const result = await service.addQuestion('coach-1', {
        question: 'New Q?',
        type: 'TEXT' as any,
      });

      expect(prisma.onboardingQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 6, question: 'New Q?' }),
        }),
      );
      expect(result).toEqual(newQuestion);
    });

    it('should use order 1 when no questions exist yet', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.findFirst.mockResolvedValue(null);
      prisma.onboardingQuestion.create.mockResolvedValue({ id: 'q-1', order: 1 });

      await service.addQuestion('coach-1', { question: 'First?', type: 'TEXT' as any });

      expect(prisma.onboardingQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 1 }),
        }),
      );
    });
  });

  // ── deleteQuestion ─────────────────────────────────────────────────────

  describe('deleteQuestion()', () => {
    it('should soft-delete (set isActive: false)', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.update.mockResolvedValue({ id: 'q-1', isActive: false });

      const result = await service.deleteQuestion('coach-1', 'q-1');

      expect(prisma.onboardingQuestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q-1', formId: 'form-1' },
          data: { isActive: false },
        }),
      );
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when form does not exist', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValue(null);

      await expect(service.deleteQuestion('coach-x', 'q-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPendingOnboardings ──────────────────────────────────────────────

  describe('getPendingOnboardings()', () => {
    it('should return onboarding profiles for the coach', async () => {
      const mockProfiles = [
        { id: 'p-1', status: 'PENDING_REVIEW', athlete: { name: 'João', email: 'joao@test.com' } },
      ];
      prisma.onboardingProfile.findMany.mockResolvedValue(mockProfiles);

      const result = await service.getPendingOnboardings('coach-1');

      expect(prisma.onboardingProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ coachId: 'coach-1' }),
        }),
      );
      expect(result).toEqual(mockProfiles);
    });
  });

  // ── reorderQuestions ───────────────────────────────────────────────────

  describe('reorderQuestions()', () => {
    it('should update order for all provided questions', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.update.mockResolvedValue({});

      const orders = [
        { id: 'q-1', order: 3 },
        { id: 'q-2', order: 1 },
      ];

      const result = await service.reorderQuestions('coach-1', orders);

      expect(prisma.onboardingQuestion.update).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ updated: 2 });
    });
  });

  // ── H6: public submit / checkout ───────────────────────────────────────

  describe('H6 — public onboarding', () => {
    const base = {
      athleteName: 'Vítima', athleteEmail: 'victim@test.com', answers: { q1: 'x' },
      acceptTerms: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, healthDataConsent: true,
    };

    beforeEach(() => {
      prisma.user.findFirst.mockReset();
      (analyzeSpy = jest.spyOn(service as any, 'analyzeWithAI').mockResolvedValue(undefined));
    });
    let analyzeSpy: jest.SpyInstance;

    it('M10: rejeita envio com pergunta obrigatória sem resposta (antes de qualquer gravação)', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValueOnce({ questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] });
      await expect(
        service.submitForm('coach-1', { ...base, answers: { q1: 'x', q2: '  ', q3: [] } } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('M10: aceita quando todas as obrigatórias têm resposta (0/false contam)', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValueOnce({ questions: [{ id: 'q1' }, { id: 'q2' }] });
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'victim-id', name: 'V', email: 'victim@test.com' });
      const res: any = await service.submitForm('coach-1', { ...base, answers: { q1: 'x', q2: 0 } } as any);
      expect(res.existingAccount).toBe(true);
    });

    it('e-mail existente: não altera nada e não retorna athleteId', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'victim-id', name: 'V', email: 'victim@test.com' });
      const res: any = await service.submitForm('coach-1', base as any);
      expect(res).toEqual({ ok: true, existingAccount: true, requiresPayment: false });
      expect(JSON.stringify(res)).not.toContain('victim-id');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.onboardingProfile.update).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(emailService.sendTransactional).toHaveBeenCalledWith('victim@test.com', expect.any(String), expect.any(String));
    });

    it('conta nova: registra consentimento (inclui dados de saúde) e retorna onboardingToken opaco', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({ email: 'c@x', name: 'C' });
      prisma.notification.create.mockResolvedValue({});
      const res: any = await service.submitForm('coach-1', base as any, { ip: '1.2.3.4' });
      expect(res.ok).toBe(true);
      expect(res.existingAccount).toBe(false);
      expect(res.requiresPayment).toBe(true);
      expect(typeof res.onboardingToken).toBe('string');
      expect(res.athleteId).toBeUndefined();
      expect(res.onboardingToken).not.toContain('new-ath');
      expect(legal.recordConsent).toHaveBeenCalledWith(
        'new-ath',
        expect.objectContaining({ healthDataConsent: true, termsVersion: TERMS_VERSION }),
        { ip: '1.2.3.4' },
        lastTx,
      );
      // token decifra para o atleta/coach corretos
      expect(service.verifyOnboardingToken(res.onboardingToken)).toEqual({ athleteId: 'new-ath', coachId: 'coach-1' });
    });

    it('senha temporária não usa Math.random', async () => {
      const spy = jest.spyOn(Math, 'random');
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({});
      await service.submitForm('coach-1', base as any);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('rejeita sem consentimento de dados de saúde', async () => {
      await expect(service.submitForm('coach-1', { ...base, healthDataConsent: false } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('checkout público exige token válido (não aceita athleteId)', async () => {
      await expect(service.createCheckoutWithToken('slug', 'victim-id', 'mensal')).rejects.toBeInstanceOf(BadRequestException);
      expect(memberships.subscribe).not.toHaveBeenCalled();
    });

    it('checkout público rejeita token de outro coach', async () => {
      const tok = service.issueOnboardingToken('ath-1', 'coach-A');
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-B' });
      await expect(service.createCheckoutWithToken('slug-b', tok)).rejects.toBeInstanceOf(BadRequestException);
    });

    // ── Regressão QA atleta C1 / M14 ──
    describe('C1 — checkout do onboarding vira mensalidade da equipe (Asaas/FAKE)', () => {
      const athlete = { id: 'ath-1', role: 'ATHLETE', name: 'Lead Novo', email: 'lead@x.com', phone: null, referralCreditCents: 2500 };

      it('cria a mensalidade no plano da equipe via MembershipsService e devolve o /pedido', async () => {
        const tok = service.issueOnboardingToken('ath-1', 'coach-A');
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-A' });
        prisma.user.findUnique.mockResolvedValueOnce(athlete);
        const r: any = await service.createCheckoutWithToken('slug-a', tok, 'trimestral', { buyer: { cpf: '52998224725' } });
        expect(memberships.subscribe).toHaveBeenCalledWith(
          { id: 'ath-1' },
          expect.objectContaining({ planId: 'plan-t', buyer: expect.objectContaining({ cpf: '52998224725', email: 'lead@x.com', name: 'Lead Novo' }) }),
        );
        expect(paymentsService.createSubscription).not.toHaveBeenCalled(); // nada de Mercado Pago fixo
        expect(r.payPath).toBe('/pedido/pay-1?token=tok');
        expect(r.plan.id).toBe('plan-t');
      });

      it('planId explícito precisa ser da equipe', async () => {
        const tok = service.issueOnboardingToken('ath-1', 'coach-A');
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-A' });
        prisma.user.findUnique.mockResolvedValueOnce(athlete);
        await expect(service.createCheckoutWithToken('slug-a', tok, undefined, { planId: 'outro', buyer: { cpf: '1' } })).rejects.toThrow('Plano não encontrado');
      });

      it('crédito de indicação NÃO é zerado (nem antes nem depois de falha do gateway)', async () => {
        const tok = service.issueOnboardingToken('ath-1', 'coach-A');
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-A' });
        prisma.user.findUnique.mockResolvedValueOnce(athlete);
        memberships.subscribe.mockRejectedValueOnce(new BadRequestException('Gateway de pagamento não configurado'));
        await expect(service.createCheckoutWithToken('slug-a', tok, 'mensal', { buyer: { cpf: '52998224725' } })).rejects.toThrow('Gateway');
        expect((prisma.user as any).update).not.toHaveBeenCalled();
      });

      it('sem planos ativos na equipe → erro claro (não 500)', async () => {
        const tok = service.issueOnboardingToken('ath-1', 'coach-A');
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-A' });
        prisma.user.findUnique.mockResolvedValueOnce(athlete);
        (prisma as any).teamPlan.findMany.mockResolvedValueOnce([]);
        await expect(service.createCheckoutWithToken('slug-a', tok)).rejects.toBeInstanceOf(BadRequestException);
      });

      it('M14: gera link "Defina sua senha" (token do reset-password, 72 h) e envia por e-mail', async () => {
        const tok = service.issueOnboardingToken('ath-1', 'coach-A');
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'coach-A' });
        prisma.user.findUnique.mockResolvedValueOnce(athlete);
        const r: any = await service.createCheckoutWithToken('slug-a', tok, 'mensal', { buyer: { cpf: '52998224725' } });
        expect(r.setPasswordPath).toMatch(/^\/reset-password\?token=[0-9a-f]{64}&email=lead%40x\.com/);
        const up = (prisma as any).appConfig.upsert.mock.calls[0][0];
        expect(up.where.key).toBe('password_reset:ath-1');
        expect(new Date(up.create.value.expiresAt).getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);
        expect(emailService.sendTransactional).toHaveBeenCalledWith('lead@x.com', 'Defina sua senha de acesso', expect.stringContaining('/reset-password?token='));
      });
    });
  });
});
