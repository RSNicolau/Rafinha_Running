import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentsService } from '../payments.service';
import { PaymentsController } from '../payments.controller';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { buildValidationPipe } from '../../../common/pipes/validation.pipe';
import { UpdatePaymentSettingsDto } from '../dto/payment-settings.dto';

function setup(profile: any = null, managerTeams: string[] = ['t1']) {
  const prisma: any = {
    coachProfile: { findUnique: jest.fn().mockResolvedValue(profile), upsert: jest.fn().mockResolvedValue({}) },
    teamMember: { findMany: jest.fn().mockResolvedValue(managerTeams.map((teamId) => ({ teamId }))) },
    user: { findUnique: jest.fn().mockResolvedValue({ role: 'COACH' }) },
  };
  const svc = new PaymentsService(prisma, {} as any, {} as any);
  return { svc, prisma };
}

describe('Payments /settings (reteste M)', () => {
  const OLD = process.env;
  const fetchBackup = global.fetch;
  beforeEach(() => {
    process.env = { ...OLD, API_KEY_ENCRYPTION_SECRET: 'x'.repeat(40) };
  });
  afterEach(() => {
    process.env = OLD;
    global.fetch = fetchBackup;
  });

  it('routes require COACH via RolesGuard', () => {
    const r = new Reflector();
    for (const h of ['getPaymentSettings', 'updatePaymentSettings', 'testPaymentConnection']) {
      expect(r.get(ROLES_KEY, (PaymentsController.prototype as any)[h])).toEqual(['COACH']);
    }
  });

  it('COACH without OWNER/ADMIN team role → 403; OWNER/ADMIN → ok; platform admin → ok', async () => {
    const { svc } = setup(null, []);
    await expect(svc.assertCanManagePaymentSettings({ id: 'c', role: 'COACH' })).rejects.toThrow(ForbiddenException);
    await expect(svc.assertCanManagePaymentSettings({ id: 'a', role: 'ATHLETE' })).rejects.toThrow(ForbiddenException);
    await expect(setup(null, ['t1']).svc.assertCanManagePaymentSettings({ id: 'c', role: 'COACH' })).resolves.toBeUndefined();
    await expect(svc.assertCanManagePaymentSettings({ id: 'x', role: 'SUPER_ADMIN' })).resolves.toBeUndefined();
  });

  it('GET without coach profile → defaults, nothing created', async () => {
    const { svc, prisma } = setup(null);
    await expect(svc.getPaymentSettings('c')).resolves.toMatchObject({ provider: 'pagarme', paymentEnabled: false, hasPagarmeKey: false });
    expect(prisma.coachProfile.upsert).not.toHaveBeenCalled();
  });

  it('PUT for a non-coach account never creates a coach profile', async () => {
    const { svc, prisma } = setup(null);
    prisma.user.findUnique.mockResolvedValue({ role: 'ATHLETE' });
    await expect(svc.updatePaymentSettings('ath', { provider: 'pagarme', paymentEnabled: true })).rejects.toThrow('Perfil de treinador não encontrado');
    expect(prisma.coachProfile.upsert).not.toHaveBeenCalled();
  });

  it('DTO: whitelist + provider/boolean validation with PT messages', async () => {
    const pipe = buildValidationPipe();
    const meta = { type: 'body', metatype: UpdatePaymentSettingsDto } as any;
    await expect(pipe.transform({ provider: 'pagarme', paymentEnabled: true }, meta)).resolves.toBeInstanceOf(UpdatePaymentSettingsDto);
    const err: any = await pipe.transform({ provider: 'paypal', hack: 1 }, meta).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const msgs: string[] = err.getResponse().message;
    expect(msgs).toEqual(expect.arrayContaining(['Gateway inválido (use pagarme ou stripe)', 'Pagamentos ativos deve ser verdadeiro ou falso']));
    expect(msgs.some((m) => m.includes('hack'))).toBe(true);
  });

  it('/settings/test: no key → 400 (PT), never a plain Error', async () => {
    const { svc } = setup({ paymentProvider: 'pagarme', pagarmeApiKey: null });
    await expect(svc.testPaymentConnection('c')).rejects.toThrow(BadRequestException);
    await expect(svc.testPaymentConnection('c')).rejects.toThrow('API Key do Pagar.me não configurada');
    await expect(setup(null).svc.testPaymentConnection('c')).rejects.toThrow(BadRequestException);
  });

  it('/settings/test: corrupt stored key → 400; network failure → 503; 401 → 400; 5xx → 503; ok → latency', async () => {
    const { svc, prisma } = setup({ paymentProvider: 'stripe', stripeSecretKey: 'lixo' });
    await expect(svc.testPaymentConnection('c')).rejects.toThrow(BadRequestException);

    // grava uma chave válida pelo próprio service e reaproveita o ciphertext
    await svc.updatePaymentSettings('c', { provider: 'stripe', paymentEnabled: true, stripeSecretKey: 'sk_test_1' });
    const enc = prisma.coachProfile.upsert.mock.calls[0][0].update.stripeSecretKey;
    prisma.coachProfile.findUnique.mockResolvedValue({ paymentProvider: 'stripe', stripeSecretKey: enc });

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(svc.testPaymentConnection('c')).rejects.toThrow(ServiceUnavailableException);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;
    await expect(svc.testPaymentConnection('c')).rejects.toThrow(BadRequestException);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as any;
    await expect(svc.testPaymentConnection('c')).rejects.toThrow(ServiceUnavailableException);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    await expect(svc.testPaymentConnection('c')).resolves.toMatchObject({ ok: true, provider: 'stripe' });
  });

  it('missing encryption secret → 503 (not 500)', async () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    const { svc } = setup(null);
    await expect(svc.updatePaymentSettings('c', { provider: 'stripe', paymentEnabled: true, stripeSecretKey: 'sk' })).rejects.toThrow(ServiceUnavailableException);
  });
});
