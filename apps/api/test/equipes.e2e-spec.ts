/**
 * E2E — Equipes (assessorias): dono, gestão, treinadores, apoio e escopo dos atletas.
 *
 * Fluxo: dono se cadastra (equipe criada automaticamente) → convida treinador (token volta só em NODE_ENV=test)
 * → treinador se cadastra com teamInviteToken → dono convida atleta (fluxo /invites) e atribui o treinador
 * → treinador vê o atleta; outro treinador da mesma equipe NÃO vê; dono de outra equipe não vê nada;
 * STAFF lista atletas mas não lê avaliações (dados de saúde).
 *
 * Requer a API em NODE_ENV=test. Run: TEST_API_URL=http://localhost:3000 npx jest --config jest-e2e.config.js test/equipes
 */
import request from 'supertest';
import { BASE, CONSENT, linkAthleteToCoach } from './helpers';

const ts = Date.now();
const PW = 'Test12345!';
const api = () => request(BASE);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function register(email: string, name: string, extra: Record<string, any> = {}) {
  const res = await api().post('/api/v1/auth/register').send({ ...CONSENT, email, password: PW, name, ...extra });
  if (res.status !== 201) throw new Error(`register ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { accessToken: string; user: { id: string; team: any }; team: any };
}

async function inviteMember(ownerToken: string, email: string, role: 'ADMIN' | 'COACH' | 'STAFF') {
  const res = await api().post('/api/v1/teams/me/members/invite').set(auth(ownerToken)).send({ email, role });
  if (res.status !== 201 || !res.body.token) throw new Error(`invite ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

describe('Equipes (assessorias)', () => {
  const emails = {
    owner: `eq_owner_${ts}@test.com`,
    coach1: `eq_coach1_${ts}@test.com`,
    coach2: `eq_coach2_${ts}@test.com`,
    staff: `eq_staff_${ts}@test.com`,
    athlete: `eq_athlete_${ts}@test.com`,
    athlete2: `eq_athlete2_${ts}@test.com`,
    otherOwner: `eq_other_${ts}@test.com`,
  };
  let owner: any, coach1: any, coach2: any, staff: any, athlete: any, athlete2: any, otherOwner: any;
  let teamId: string;

  beforeAll(async () => {
    owner = await register(emails.owner, 'Dona Equipe', { role: 'COACH', teamName: `Assessoria E2E ${ts}` });
    otherOwner = await register(emails.otherOwner, 'Outro Dono', { role: 'COACH' });
    athlete = await register(emails.athlete, 'Atleta Equipe');
    athlete2 = await register(emails.athlete2, 'Atleta Dois');
  });

  it('cadastro de treinador cria a equipe (OWNER) e as respostas de auth trazem a equipe', async () => {
    expect(owner.team).toEqual(expect.objectContaining({ role: 'OWNER', name: `Assessoria E2E ${ts}` }));
    expect(owner.team.slug).toMatch(/^assessoria-e2e-/);
    expect(owner.user.team).toEqual(owner.team);
    teamId = owner.team.id;

    const me = await api().get('/api/v1/users/me').set(auth(owner.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.team).toEqual(expect.objectContaining({ id: teamId, role: 'OWNER' }));

    const mine = await api().get('/api/v1/teams/me').set(auth(owner.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.activeTeam).toEqual(expect.objectContaining({ id: teamId, role: 'OWNER' }));
    expect(mine.body.teams).toHaveLength(1);

    const login = await api().post('/api/v1/auth/login').send({ email: emails.owner, password: PW });
    expect(login.status).toBe(200);
    expect(login.body.team).toEqual(expect.objectContaining({ id: teamId, role: 'OWNER' }));
  });

  it('atleta não tem equipe técnica e não acessa rotas de equipe', async () => {
    expect(athlete.team).toBeNull();
    const res = await api().get('/api/v1/teams/me/athletes').set(auth(athlete.accessToken));
    expect(res.status).toBe(404);
  });

  it('dono convida treinador; treinador se cadastra com teamInviteToken e entra na equipe (sem criar equipe própria)', async () => {
    const check = await api().get('/api/v1/teams/invites/check').query({ token: await inviteMember(owner.accessToken, emails.coach1, 'COACH') });
    expect(check.status).toBe(200);
    expect(check.body).toEqual(expect.objectContaining({ email: emails.coach1, role: 'COACH', existingAccount: false }));

    const token1 = await inviteMember(owner.accessToken, emails.coach1, 'COACH');
    // e-mail diferente do convite → recusado
    const wrong = await api().post('/api/v1/auth/register').send({ ...CONSENT, email: `x_${emails.coach1}`, password: PW, name: 'X', role: 'COACH', teamInviteToken: token1 });
    expect(wrong.status).toBe(400);

    coach1 = await register(emails.coach1, 'Treinador Um', { role: 'COACH', teamInviteToken: token1 });
    expect(coach1.team).toEqual(expect.objectContaining({ id: teamId, role: 'COACH' }));

    coach2 = await register(emails.coach2, 'Treinador Dois', { role: 'COACH', teamInviteToken: await inviteMember(owner.accessToken, emails.coach2, 'COACH') });
    staff = await register(emails.staff, 'Apoio Equipe', { role: 'COACH', teamInviteToken: await inviteMember(owner.accessToken, emails.staff, 'STAFF') });
    expect(staff.team).toEqual(expect.objectContaining({ id: teamId, role: 'STAFF' }));

    const members = await api().get('/api/v1/teams/me/members').set(auth(owner.accessToken));
    expect(members.status).toBe(200);
    const roles = Object.fromEntries(members.body.map((m: any) => [m.email, m.role]));
    expect(roles).toEqual(expect.objectContaining({ [emails.owner]: 'OWNER', [emails.coach1]: 'COACH', [emails.coach2]: 'COACH', [emails.staff]: 'STAFF' }));
  });

  it('COACH não convida membros nem altera a equipe; ATHLETE não aceita convite de equipe técnica', async () => {
    const inv = await api().post('/api/v1/teams/me/members/invite').set(auth(coach1.accessToken)).send({ email: `n_${ts}@t.com`, role: 'COACH' });
    expect(inv.status).toBe(403);
    const put = await api().put('/api/v1/teams/me').set(auth(coach1.accessToken)).send({ name: 'Hack' });
    expect(put.status).toBe(403);

    const tok = (await api().post('/api/v1/teams/me/members/invite').set(auth(owner.accessToken)).send({ email: `conv_${ts}@t.com`, role: 'COACH' })).body.token;
    const acc = await api().post('/api/v1/teams/invites/accept').set(auth(athlete.accessToken)).send({ token: tok });
    expect([400, 403]).toContain(acc.status);
  });

  it('dono convida atleta (fluxo /invites) e atribui o treinador 1', async () => {
    await linkAthleteToCoach(owner.accessToken, athlete.accessToken, emails.athlete);
    await linkAthleteToCoach(owner.accessToken, athlete2.accessToken, emails.athlete2);

    const list = await api().get('/api/v1/teams/me/athletes').set(auth(owner.accessToken));
    expect(list.status).toBe(200);
    const ids = list.body.data.map((a: any) => a.id);
    expect(ids).toEqual(expect.arrayContaining([athlete.user.id, athlete2.user.id]));

    // atleta agora pertence à equipe
    const athleteMe = await api().get('/api/v1/users/me').set(auth(athlete.accessToken));
    expect(athleteMe.body.team).toEqual(expect.objectContaining({ id: teamId, role: 'ATHLETE' }));

    // não pode atribuir STAFF como treinador
    const bad = await api().patch(`/api/v1/teams/me/athletes/${athlete.user.id}/coach`).set(auth(owner.accessToken)).send({ coachId: staff.user.id });
    expect(bad.status).toBe(400);

    const ok = await api().patch(`/api/v1/teams/me/athletes/${athlete.user.id}/coach`).set(auth(owner.accessToken)).send({ coachId: coach1.user.id });
    expect(ok.status).toBe(200);

    // COACH não reatribui
    const forbidden = await api().patch(`/api/v1/teams/me/athletes/${athlete.user.id}/coach`).set(auth(coach1.accessToken)).send({ coachId: coach2.user.id });
    expect(forbidden.status).toBe(403);
  });

  it('treinador 1 vê o atleta atribuído (lista + avaliações); treinador 2 não vê', async () => {
    const l1 = await api().get('/api/v1/teams/me/athletes').set(auth(coach1.accessToken));
    expect(l1.status).toBe(200);
    expect(l1.body.data.map((a: any) => a.id)).toEqual([athlete.user.id]);

    const legacy = await api().get('/api/v1/users/athletes').set(auth(coach1.accessToken));
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.map((a: any) => a.userId)).toEqual([athlete.user.id]);

    const pa1 = await api().get(`/api/v1/physical-assessments/athlete/${athlete.user.id}`).set(auth(coach1.accessToken));
    expect(pa1.status).toBe(200);

    const l2 = await api().get('/api/v1/teams/me/athletes').set(auth(coach2.accessToken));
    expect(l2.status).toBe(200);
    expect(l2.body.data.map((a: any) => a.id)).not.toContain(athlete.user.id);
    // filtro de treinador vindo do cliente é ignorado para COACH
    const l2f = await api().get('/api/v1/teams/me/athletes').query({ coachId: coach1.user.id }).set(auth(coach2.accessToken));
    expect(l2f.body.data.map((a: any) => a.id)).not.toContain(athlete.user.id);

    const pa2 = await api().get(`/api/v1/physical-assessments/athlete/${athlete.user.id}`).set(auth(coach2.accessToken));
    expect(pa2.status).toBe(404);
  });

  it('dono vê todos e filtra por treinador', async () => {
    const f = await api().get('/api/v1/teams/me/athletes').query({ coachId: coach1.user.id }).set(auth(owner.accessToken));
    expect(f.status).toBe(200);
    expect(f.body.data.map((a: any) => a.id)).toEqual([athlete.user.id]);
    const pa = await api().get(`/api/v1/physical-assessments/athlete/${athlete.user.id}`).set(auth(owner.accessToken));
    expect(pa.status).toBe(200);
  });

  it('dono de outra equipe não vê nada', async () => {
    const l = await api().get('/api/v1/teams/me/athletes').set(auth(otherOwner.accessToken));
    expect(l.status).toBe(200);
    expect(l.body.data).toEqual([]);
    const pa = await api().get(`/api/v1/physical-assessments/athlete/${athlete.user.id}`).set(auth(otherOwner.accessToken));
    expect(pa.status).toBe(404);
    // header x-team-id de equipe alheia → 403
    const hdr = await api().get('/api/v1/teams/me/athletes').set(auth(otherOwner.accessToken)).set('x-team-id', teamId);
    expect(hdr.status).toBe(403);
  });

  it('STAFF lista atletas, mas não lê avaliações físicas (dados de saúde)', async () => {
    const l = await api().get('/api/v1/teams/me/athletes').set(auth(staff.accessToken));
    expect(l.status).toBe(200);
    expect(l.body.data.map((a: any) => a.id)).toEqual(expect.arrayContaining([athlete.user.id, athlete2.user.id]));
    const pa = await api().get(`/api/v1/physical-assessments/athlete/${athlete.user.id}`).set(auth(staff.accessToken));
    expect(pa.status).toBe(403);
  });

  it('planos de mensalidade: dono cria; COACH lê mas não cria; página pública lista os ativos', async () => {
    const plans = [
      { name: 'Mensal', interval: 'MONTHLY', priceInCents: 17400, sortOrder: 1 },
      { name: 'Trimestral', interval: 'QUARTERLY', priceInCents: 49500, sortOrder: 2 },
    ];
    for (const p of plans) {
      const r = await api().post('/api/v1/teams/me/plans').set(auth(owner.accessToken)).send(p);
      expect(r.status).toBe(201);
    }
    const c = await api().post('/api/v1/teams/me/plans').set(auth(coach1.accessToken)).send(plans[0]);
    expect(c.status).toBe(403);
    const read = await api().get('/api/v1/teams/me/plans').set(auth(coach1.accessToken));
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(2);

    const pub = await api().get(`/api/v1/teams/public/${owner.team.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.plans.map((p: any) => p.priceInCents)).toEqual([17400, 49500]);
    expect(pub.body.asaasWalletId).toBeUndefined();
  });

  it('configurações: dono define carteira (UUID) e tolerância; taxa da plataforma não é editável pela equipe', async () => {
    const bad = await api().put('/api/v1/teams/me').set(auth(owner.accessToken)).send({ asaasWalletId: 'abc' });
    expect(bad.status).toBe(400);
    const fee = await api().put('/api/v1/teams/me').set(auth(owner.accessToken)).send({ platformFeePercent: 0 });
    expect(fee.status).toBe(400);
    const ok = await api().put('/api/v1/teams/me').set(auth(owner.accessToken)).send({
      asaasWalletId: '0b9f7a0e-2c4d-4e8b-9f61-1a2b3c4d5e6f', graceDays: 7, city: 'Niterói - RJ',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual(expect.objectContaining({ graceDays: 7, hasWallet: true }));
    const adminFee = await api().put(`/api/v1/admin/teams/${teamId}/fee`).set(auth(owner.accessToken)).send({ platformFeePercent: 1 });
    expect(adminFee.status).toBe(403);
  });

  it('desativar treinador devolve os atletas dele ao dono', async () => {
    const d = await api().delete(`/api/v1/teams/me/members/${coach1.user.id}`).set(auth(owner.accessToken));
    expect(d.status).toBe(200);
    const f = await api().get('/api/v1/teams/me/athletes').query({ coachId: owner.user.id }).set(auth(owner.accessToken));
    expect(f.body.data.map((a: any) => a.id)).toContain(athlete.user.id);
    const gone = await api().get('/api/v1/teams/me/athletes').set(auth(coach1.accessToken));
    expect(gone.status).toBe(404); // sem equipe ativa
  });
});
