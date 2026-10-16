/**
 * Mensalidades (assinatura recorrente atleta → equipe) contra a API real com o provedor FAKE
 * (NODE_ENV=test, PAYMENTS_FAKE_PROVIDER=true, sem ASAAS_API_KEY).
 *
 *  coach cadastra (equipe criada automaticamente) → cria plano (/teams/me/plans) → atleta vinculado
 *  → assina com FAKE → paga (fake-pay) → mensalidade ACTIVE → resumo da equipe com 1 ativo e MRR.
 *
 * Depende do módulo de equipes (outro engenheiro): se GET /teams/me ou POST /teams/me/plans ainda
 * não existirem, a suíte é PULADA (cada teste retorna cedo com aviso no console).
 */
import request from 'supertest';
import { BASE, CONSENT, linkAthleteToCoach } from './helpers';

const ts = Date.now();
const CPF = '52998224725';
const api = () => request(BASE);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function register(email: string, role?: 'COACH') {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: 'Test12345!', name: email.split('@')[0], ...(role ? { role } : {}) });
  if (res.status !== 201) throw new Error(`register ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, id: res.body.user.id as string, email };
}

type U = { token: string; id: string; email: string };
let coach: U;
let athlete: U;
let outsider: U;
let planId = '';
let ready = false;
let skipReason = '';

function skipped(): boolean {
  if (!ready) console.warn(`[mensalidades.e2e] PULADO: ${skipReason}`);
  return !ready;
}

beforeAll(async () => {
  coach = await register(`coach_m_${ts}@test.com`, 'COACH');
  athlete = await register(`atleta_m_${ts}@test.com`);
  outsider = await register(`atleta_out_${ts}@test.com`);

  const team = await api().get('/api/v1/teams/me').set(auth(coach.token));
  if (team.status !== 200) {
    skipReason = `GET /teams/me → ${team.status} (equipe automática ainda não disponível)`;
    return;
  }
  const p = await api()
    .post('/api/v1/teams/me/plans')
    .set(auth(coach.token))
    .send({ name: 'Mensal E2E', interval: 'MONTHLY', priceInCents: 17400, benefits: ['Planilha personalizada'] });
  if (![200, 201].includes(p.status) || !p.body?.id) {
    skipReason = `POST /teams/me/plans → ${p.status} ${JSON.stringify(p.body)}`;
    return;
  }
  planId = p.body.id;
  // plano trimestral só para o catálogo (MRR conta somente mensalidades ATIVAS)
  await api().post('/api/v1/teams/me/plans').set(auth(coach.token)).send({ name: 'Trimestral E2E', interval: 'QUARTERLY', priceInCents: 49500 });
  await linkAthleteToCoach(coach.token, athlete.token, athlete.email);
  ready = true;
}, 60000);

describe('Mensalidades — assinatura FAKE ponta a ponta', () => {
  let paymentId = '';
  let accessToken = '';

  it('atleta vê os planos da SUA equipe em /memberships/me', async () => {
    if (skipped()) return;
    const r = await api().get('/api/v1/memberships/me').set(auth(athlete.token));
    expect(r.status).toBe(200);
    expect(r.body.team).toBeTruthy();
    expect(r.body.plans.map((p: any) => p.id)).toContain(planId);
    expect(r.body.membership).toBeNull();
    expect(r.body.methods.fake).toBe(true);
  });

  it('atleta de fora da equipe não assina o plano (404) e não vê o financeiro da equipe', async () => {
    if (skipped()) return;
    const s = await api()
      .post('/api/v1/memberships/subscribe')
      .set(auth(outsider.token))
      .send({ planId, buyer: { name: 'Fora da Equipe', email: outsider.email, cpf: CPF } });
    expect(s.status).toBe(404);
    const sum = await api().get('/api/v1/memberships/team/summary').set(auth(athlete.token));
    expect([403, 404]).toContain(sum.status);
  });

  it('CPF inválido → 400', async () => {
    if (skipped()) return;
    const r = await api()
      .post('/api/v1/memberships/subscribe')
      .set(auth(athlete.token))
      .send({ planId, buyer: { name: 'Maria Atleta', email: athlete.email, cpf: '11111111111' } });
    expect(r.status).toBe(400);
  });

  it('assina com o provedor FAKE → cobrança pendente consultável em /checkout/:id/status', async () => {
    if (skipped()) return;
    const r = await api()
      .post('/api/v1/memberships/subscribe')
      .set(auth(athlete.token))
      .send({ planId, buyer: { name: 'Maria Atleta', email: athlete.email, cpf: CPF }, billingType: 'PIX' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ provider: 'FAKE', amountInCents: 17400, membershipStatus: 'PENDING', status: 'PENDING' });
    expect(r.body.pix?.copyPaste).toContain('FAKE-PIX');
    paymentId = r.body.paymentId;
    accessToken = r.body.accessToken;
    expect(paymentId).toBeTruthy();

    const st = await api().get(`/api/v1/checkout/${paymentId}/status?token=${encodeURIComponent(accessToken)}`);
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ status: 'PENDING', purpose: 'MEMBERSHIP', fakePayAvailable: true });
    expect(st.body.reference).toMatchObject({ type: 'MEMBERSHIP', planName: 'Mensal E2E' });
  });

  it('clique duplo devolve a mesma cobrança', async () => {
    if (skipped()) return;
    const r = await api()
      .post('/api/v1/memberships/subscribe')
      .set(auth(athlete.token))
      .send({ planId, buyer: { name: 'Maria Atleta', email: athlete.email, cpf: CPF }, billingType: 'PIX' });
    expect(r.status).toBe(201);
    expect(r.body.paymentId).toBe(paymentId);
  });

  it('fake-pay → mensalidade ACTIVE com período de 1 mês', async () => {
    if (skipped()) return;
    const pay = await api().post(`/api/v1/checkout/${paymentId}/fake-pay?token=${encodeURIComponent(accessToken)}`).send({});
    expect([200, 201]).toContain(pay.status);
    const st = await api().get(`/api/v1/checkout/${paymentId}/status?token=${encodeURIComponent(accessToken)}`);
    expect(st.body.status).toBe('SUCCEEDED');

    const me = await api().get('/api/v1/memberships/me').set(auth(athlete.token));
    expect(me.status).toBe(200);
    expect(me.body.membership).toMatchObject({ status: 'ACTIVE', hasAccess: true, priceInCents: 17400 });
    expect(me.body.access).toMatchObject({ active: true, banner: null, blocksTraining: false });
    const start = new Date(me.body.membership.currentPeriodStart).getTime();
    const end = new Date(me.body.membership.currentPeriodEnd).getTime();
    const days = (end - start) / 86400000;
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
    expect(me.body.payments[0]).toMatchObject({ status: 'SUCCEEDED', amountInCents: 17400 });
  });

  it('assinar de novo o mesmo plano ativo → 409', async () => {
    if (skipped()) return;
    const r = await api()
      .post('/api/v1/memberships/subscribe')
      .set(auth(athlete.token))
      .send({ planId, buyer: { name: 'Maria Atleta', email: athlete.email, cpf: CPF } });
    expect(r.status).toBe(409);
  });

  it('resumo da equipe: 1 ativo, MRR R$ 174, recebido no mês R$ 174', async () => {
    if (skipped()) return;
    const r = await api().get('/api/v1/memberships/team/summary').set(auth(coach.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ activeCount: 1, mrrInCents: 17400, receivedThisMonthInCents: 17400, pastDueCount: 0, hasPlans: true });
  });

  it('listagem e CSV da equipe', async () => {
    if (skipped()) return;
    const l = await api().get('/api/v1/memberships/team?status=ACTIVE').set(auth(coach.token));
    expect(l.status).toBe(200);
    expect(l.body.total).toBe(1);
    expect(l.body.items[0]).toMatchObject({ status: 'ACTIVE', athlete: { id: athlete.id }, lastPayment: { amountInCents: 17400 } });

    const csv = await api().get('/api/v1/memberships/team/export.csv').set(auth(coach.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(athlete.email);
  });

  it('pagamento recebido por fora (dono): valor ≠ preço → 400; correto → MANUAL, período avança 1 ciclo', async () => {
    if (skipped()) return;
    const l = await api().get('/api/v1/memberships/team').set(auth(coach.token));
    const item = l.body.items[0];
    const before = new Date(item.currentPeriodEnd).getTime();

    const bad = await api().post(`/api/v1/memberships/team/${item.id}/mark-paid-offline`).set(auth(coach.token)).send({ amountInCents: 100 });
    expect(bad.status).toBe(400);
    const notMine = await api().post(`/api/v1/memberships/team/${item.id}/mark-paid-offline`).set(auth(athlete.token)).send({ amountInCents: 17400 });
    expect([403, 404]).toContain(notMine.status);

    const ok = await api()
      .post(`/api/v1/memberships/team/${item.id}/mark-paid-offline`)
      .set(auth(coach.token))
      .send({ amountInCents: 17400, note: 'Pix direto (e2e)' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ created: true, payment: { provider: 'MANUAL', status: 'SUCCEEDED', amountInCents: 17400 }, membership: { status: 'ACTIVE' } });
    const days = (new Date(ok.body.membership.currentPeriodEnd).getTime() - before) / 86400000;
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);

    const again = await api().post(`/api/v1/memberships/team/${item.id}/mark-paid-offline`).set(auth(coach.token)).send({ amountInCents: 17400 });
    expect(again.body.created).toBe(false); // clique duplo não duplica

    const sum = await api().get('/api/v1/memberships/team/summary').set(auth(coach.token));
    expect(sum.body.receivedThisMonthInCents).toBe(34800);
  });

  it('lembrete sem fatura em aberto → 409', async () => {
    if (skipped()) return;
    const l = await api().get('/api/v1/memberships/team').set(auth(coach.token));
    const id = l.body.items[0].id;
    const r = await api().post(`/api/v1/memberships/team/${id}/remind`).set(auth(coach.token)).send({});
    expect(r.status).toBe(409);
  });

  it('atleta cancela: CANCELED mantendo acesso até o fim do período', async () => {
    if (skipped()) return;
    const c = await api().post('/api/v1/memberships/me/cancel').set(auth(athlete.token)).send({ reason: 'teste e2e' });
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('CANCELED');
    expect(c.body.accessUntil).toBeTruthy();
    const me = await api().get('/api/v1/memberships/me').set(auth(athlete.token));
    expect(me.body.membership).toMatchObject({ status: 'CANCELED', hasAccess: true });
    expect(me.body.access.banner).toBe('CANCELED');
    const sum = await api().get('/api/v1/memberships/team/summary').set(auth(coach.token));
    expect(sum.body).toMatchObject({ activeCount: 0, canceledLast30: 1, mrrInCents: 0 });
  });
});
