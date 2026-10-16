/**
 * Unit tests for LegalService (LGPD) — Prisma, e-mail e cache mockados (sem banco).
 */
import { BadRequestException, HttpException } from '@nestjs/common';
import { ConsentType, NotificationType } from '@prisma/client';
import { LegalService, stripSecrets } from './legal.service';
import { PRIVACY_VERSION, TERMS_VERSION } from './legal.constants';

function makePrisma() {
  const prisma: any = {
    consentLog: { createMany: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    athleteProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    coachProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    workout: { findMany: jest.fn().mockResolvedValue([]) },
    garminHealthSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    nutritionLog: { findMany: jest.fn().mockResolvedValue([]) },
    waterLog: { findMany: jest.fn().mockResolvedValue([]) },
    athleteSupplement: { findMany: jest.fn().mockResolvedValue([]) },
    physicalAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    onboardingProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    athleteDocument: { findMany: jest.fn().mockResolvedValue([]) },
    eventRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    subscription: { findMany: jest.fn().mockResolvedValue([]) },
    fitnessIntegration: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    $transaction: jest.fn(async (ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  return prisma;
}

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
  };
}

const current = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };

describe('LegalService', () => {
  let prisma: any;
  let email: { sendTransactional: jest.Mock };
  let cache: ReturnType<typeof makeCache>;
  let service: LegalService;

  beforeEach(() => {
    prisma = makePrisma();
    email = { sendTransactional: jest.fn().mockResolvedValue(undefined) };
    cache = makeCache();
    service = new LegalService(prisma, email as any, cache as any);
  });

  describe('recordConsent', () => {
    it('grava 3 ConsentLog (termos, privacidade, marketing) e atualiza o usuário', async () => {
      await service.recordConsent('u1', { ...current, marketingOptIn: true }, { ip: '1.2.3.4', userAgent: 'jest' });

      expect(prisma.consentLog.createMany).toHaveBeenCalledTimes(1);
      const rows = prisma.consentLog.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(3);
      expect(rows.map((r: any) => r.type)).toEqual([ConsentType.TERMS, ConsentType.PRIVACY, ConsentType.MARKETING]);
      expect(rows.every((r: any) => r.userId === 'u1' && r.ip === '1.2.3.4' && r.userAgent === 'jest')).toBe(true);
      expect(rows.find((r: any) => r.type === ConsentType.MARKETING).granted).toBe(true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          marketingOptIn: true,
          termsAcceptedAt: expect.any(Date),
        }),
      });
    });

    it('grava a 4ª linha HEALTH_DATA quando healthDataConsent é informado', async () => {
      await service.recordConsent('u1', { ...current, healthDataConsent: true });
      const rows = prisma.consentLog.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(4);
      expect(rows[3]).toEqual(expect.objectContaining({ type: ConsentType.HEALTH_DATA, granted: true, version: PRIVACY_VERSION }));
      // marketing omitido = não consentido
      expect(rows[2]).toEqual(expect.objectContaining({ type: ConsentType.MARKETING, granted: false }));
    });

    it('usa o client de transação quando fornecido', async () => {
      const tx = { consentLog: { createMany: jest.fn() }, user: { update: jest.fn() } };
      await service.recordConsent('u1', current, {}, tx);
      expect(tx.consentLog.createMany).toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalled();
      expect(prisma.consentLog.createMany).not.toHaveBeenCalled();
    });

    it('rejeita versões desatualizadas sem gravar nada', async () => {
      await expect(
        service.recordConsent('u1', { termsVersion: '2020-01-01', privacyVersion: PRIVACY_VERSION }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.recordConsent('u1', { termsVersion: TERMS_VERSION, privacyVersion: 'old' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consentLog.createMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('needsConsent=true quando a versão aceita é antiga', async () => {
      prisma.user.findUnique.mockResolvedValue({ termsVersion: 'old', privacyVersion: PRIVACY_VERSION, termsAcceptedAt: new Date(), marketingOptIn: false });
      const s = await service.getStatus('u1');
      expect(s.needsConsent).toBe(true);
      expect(s.healthDataConsent).toBeNull();
    });

    it('needsConsent=false com versões vigentes e retorna último consentimento de saúde', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...current, termsAcceptedAt: new Date(), marketingOptIn: true });
      prisma.consentLog.findFirst.mockResolvedValue({ granted: false, createdAt: new Date() });
      const s = await service.getStatus('u1');
      expect(s.needsConsent).toBe(false);
      expect(s.healthDataConsent).toBe(false);
    });
  });

  describe('setHealthDataConsent', () => {
    it('registra revogação como ConsentLog HEALTH_DATA granted=false', async () => {
      await service.setHealthDataConsent('u1', false, { ip: '9.9.9.9' });
      expect(prisma.consentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', type: ConsentType.HEALTH_DATA, granted: false, version: PRIVACY_VERSION }),
      });
    });
  });

  describe('exportMyData', () => {
    beforeEach(() => {
      // Simula um retorno "vazado" do banco: o serviço deve remover segredos mesmo assim
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'a@b.com', name: 'Ana', role: 'ATHLETE', appleId: 'apple-123',
        passwordHash: '$2b$hash', totpSecret: 'TOTP', aiApiKey: 'sk-secret', tokenVersion: 3,
      });
      prisma.fitnessIntegration.findMany.mockResolvedValue([
        { provider: 'STRAVA', isActive: true, accessToken: 'strava-at', refreshToken: 'strava-rt' },
      ]);
      prisma.payment.findMany.mockResolvedValue([{ id: 'p1', amount: 1000, pixQrCode: 'qr', checkoutUrl: 'https://pay' }]);
      prisma.workout.findMany.mockResolvedValue([{ id: 'w1', result: { avgHeartRate: 150 } }]);
    });

    it('exclui senha, TOTP, chave de IA e tokens', async () => {
      const data: any = await service.exportMyData('u1');
      const json = JSON.stringify(data);
      for (const secret of ['$2b$hash', 'TOTP', 'sk-secret', 'strava-at', 'strava-rt', 'apple-123', 'https://pay']) {
        expect(json).not.toContain(secret);
      }
      expect(data.user).not.toHaveProperty('passwordHash');
      expect(data.user).not.toHaveProperty('totpSecret');
      expect(data.user).not.toHaveProperty('aiApiKey');
      expect(data.user).not.toHaveProperty('tokenVersion');
      expect(data.user.appleLinked).toBe(true);
      expect(data.integrations[0]).toEqual({ provider: 'STRAVA', isActive: true });
      expect(data.workouts[0].result.avgHeartRate).toBe(150);
    });

    it('a consulta do usuário não seleciona campos secretos', async () => {
      await service.exportMyData('u1');
      const select = prisma.user.findUnique.mock.calls[0][0].select;
      expect(select.passwordHash).toBeUndefined();
      expect(select.totpSecret).toBeUndefined();
      expect(select.aiApiKey).toBeUndefined();
    });

    it('limita a 3 exportações por hora por usuário', async () => {
      await service.exportMyData('u1');
      await service.exportMyData('u1');
      await service.exportMyData('u1');
      await expect(service.exportMyData('u1')).rejects.toBeInstanceOf(HttpException);
      // outro usuário não é afetado
      await expect(service.exportMyData('u2')).resolves.toBeDefined();
    });
  });

  describe('stripSecrets', () => {
    it('remove chaves sensíveis em qualquer profundidade e preserva datas', () => {
      const d = new Date('2026-01-01');
      expect(stripSecrets({ a: 1, at: d, nested: [{ refreshToken: 'x', ok: true }] })).toEqual({
        a: 1, at: d, nested: [{ ok: true }],
      });
    });
  });

  describe('requestDeletion', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'ana@x.com', name: 'Ana <b>', role: 'ATHLETE' });
      prisma.user.findMany.mockResolvedValue([{ id: 'admin1' }, { id: 'admin2' }]);
      process.env.LEGAL_DPO_EMAIL = 'dpo@example.com';
    });
    afterEach(() => { delete process.env.LEGAL_DPO_EMAIL; });

    it('registra auditoria, notifica SUPER_ADMIN e envia e-mails ao DPO e ao titular — sem apagar nada', async () => {
      const r = await service.requestDeletion('u1', 'não uso mais', { ip: '1.1.1.1' });
      expect(r.ok).toBe(true);
      expect(r.alreadyRequested).toBe(false);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'LGPD_DELETION_REQUEST', entityId: 'u1', actorId: 'u1' }),
      });
      const notif = prisma.notification.createMany.mock.calls[0][0].data;
      expect(notif).toHaveLength(2);
      expect(notif[0]).toEqual(expect.objectContaining({ type: NotificationType.SYSTEM, title: 'Solicitação de exclusão LGPD' }));
      expect(notif[0].data).toEqual(expect.objectContaining({ userId: 'u1', kind: 'LGPD_DELETION_REQUEST' }));
      const recipients = email.sendTransactional.mock.calls.map((c) => c[0]);
      expect(recipients).toEqual(['dpo@example.com', 'ana@x.com']);
      // HTML escapado
      expect(email.sendTransactional.mock.calls[0][2]).toContain('Ana &lt;b&gt;');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('não duplica solicitação feita nas últimas 24h', async () => {
      prisma.auditLog.findFirst.mockResolvedValue({ createdAt: new Date() });
      const r = await service.requestDeletion('u1', undefined);
      expect(r.alreadyRequested).toBe(true);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(email.sendTransactional).not.toHaveBeenCalled();
    });
  });
});
