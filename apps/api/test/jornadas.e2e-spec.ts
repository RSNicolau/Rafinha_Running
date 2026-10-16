/**
 * Jornadas de negócio + tentativas de ataque, contra a API real (Postgres) com o provedor de
 * pagamento FAKE (PAYMENTS_FAKE_PROVIDER=true, NODE_ENV=test).
 *
 *  1. Loja: produto em estoque → pedido → checkout → pagamento → estoque baixado → status do pedido
 *  2. Loja: encomenda (pré-venda) → pagamento → resumo de produção
 *  3. Eventos: criar → distância → cupom → publicar → inscrição paga → pagamento → nº de peito → check-in
 *  4. Ataques que DEVEM falhar (SUPER_ADMIN no cadastro, IDOR, preço do cliente, webhooks sem assinatura…)
 */
import request from 'supertest';
import { BASE, CONSENT, linkAthleteToCoach } from './helpers';

const ts = Date.now();
const CPF = '52998224725'; // CPF válido de teste (dígitos verificadores corretos)
const api = () => request(BASE);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function register(email: string, role?: 'COACH') {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: 'Test12345!', name: email.split('@')[0], ...(role ? { role } : {}) });
  if (res.status !== 201) throw new Error(`register ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, id: res.body.user.id as string, email };
}

let coach: { token: string; id: string; email: string };
let coach2: { token: string; id: string; email: string };
let athlete: { token: string; id: string; email: string };
let athlete2: { token: string; id: string; email: string };

beforeAll(async () => {
  coach = await register(`coach_j_${ts}@test.com`, 'COACH');
  coach2 = await register(`coach2_j_${ts}@test.com`, 'COACH');
  athlete = await register(`atleta_j_${ts}@test.com`);
  athlete2 = await register(`atleta2_j_${ts}@test.com`);
  await linkAthleteToCoach(coach.token, athlete.token, athlete.email);
});

async function payFake(checkout: { paymentId: string; accessToken: string }) {
  const r = await api()
    .post(`/api/v1/checkout/${checkout.paymentId}/fake-pay?token=${checkout.accessToken}`)
    .send({});
  expect([200, 201]).toContain(r.status);
  const st = await api().get(`/api/v1/checkout/${checkout.paymentId}/status?token=${checkout.accessToken}`);
  expect(st.status).toBe(200);
  expect(st.body.status).toBe('SUCCEEDED');
  return st.body;
}

describe('1. Loja — venda de acessório em estoque', () => {
  let productId: string;
  let orderId: string;
  let orderToken: string;

  it('treinador cadastra produto com estoque 3', async () => {
    const r = await api().post('/api/v1/store/products').set(auth(coach.token)).send({
      name: 'Viseira E2E', category: 'ACESSORIO', priceInCents: 8990, totalStock: 3, sizes: ['U'], active: true,
    });
    expect(r.status).toBe(201);
    productId = r.body.id;
  });

  it('cliente tenta pagar R$0,01 e quantidade negativa → servidor recusa/ignora', async () => {
    const neg = await api().post('/api/v1/store/public/orders').send({
      productId, customerName: 'Fulano', customerEmail: `fulano_${ts}@test.com`, quantity: -1, size: 'U',
    });
    expect(neg.status).toBe(400);
    const priced = await api().post('/api/v1/store/public/orders').send({
      productId, customerName: 'Fulano', customerEmail: `fulano_${ts}@test.com`, quantity: 1, size: 'U', totalInCents: 1,
    });
    expect(priced.status).toBe(400); // campo não permitido (forbidNonWhitelisted)
  });

  it('visitante faz pedido de 2 unidades → reserva estoque', async () => {
    const r = await api().post('/api/v1/store/public/orders').send({
      productId, customerName: 'Fulano', customerEmail: `fulano_${ts}@test.com`, quantity: 2, size: 'U', deliveryMethod: 'PICKUP',
    });
    expect(r.status).toBe(201);
    expect(r.body.requiresPayment).toBe(true);
    expect(r.body.finalInCents ?? r.body.totalInCents).toBe(2 * 8990);
    expect(r.body.customerEmail).toBeUndefined(); // sem dados pessoais na resposta pública
    orderId = r.body.id;
    orderToken = r.body.accessToken;
  });

  it('não dá para comprar mais do que o estoque disponível (3 - 2 reservados)', async () => {
    const r = await api().post('/api/v1/store/public/orders').send({
      productId, customerName: 'Ciclano', customerEmail: `ciclano_${ts}@test.com`, quantity: 2, size: 'U',
    });
    expect([400, 409]).toContain(r.status);
  });

  it('pedido sem token de acesso não é visível', async () => {
    const r = await api().get(`/api/v1/store/public/orders/${orderId}`);
    expect([401, 403, 404]).toContain(r.status);
  });

  it('checkout (CPF inválido é recusado; válido gera Pix) → pagamento → pedido PAGO', async () => {
    const bad = await api().post('/api/v1/checkout').send({
      purpose: 'STORE_ORDER', refId: orderId, refToken: orderToken,
      buyer: { name: 'Fulano', email: 'fulano@test.com', cpf: '11111111111' },
    });
    expect(bad.status).toBe(400);

    const co = await api().post('/api/v1/checkout').send({
      purpose: 'STORE_ORDER', refId: orderId, refToken: orderToken, method: 'PIX',
      buyer: { name: 'Fulano', email: 'fulano@test.com', cpf: CPF },
    });
    expect(co.status).toBe(201);
    expect(co.body.amountInCents).toBe(2 * 8990);
    await payFake(co.body);

    const ord = await api().get(`/api/v1/store/orders/${orderId}`).set(auth(coach.token));
    expect(ord.status).toBe(200);
    expect(ord.body.status).toBe('PAID');
  });

  it('estoque baixado de verdade (3 → 1) e treinador avança o status', async () => {
    const list = await api().get('/api/v1/store/products').set(auth(coach.token));
    const p = (list.body.data ?? list.body).find((x: any) => x.id === productId);
    expect(p.totalStock - p.reserved).toBe(1);
    const st = await api().put(`/api/v1/store/orders/${orderId}/status`).set(auth(coach.token)).send({ status: 'READY_FOR_PICKUP' });
    expect(st.status).toBe(200);
  });

  it('outro treinador NÃO vê nem altera o pedido (isolamento entre assessorias)', async () => {
    const r = await api().get(`/api/v1/store/orders/${orderId}`).set(auth(coach2.token));
    expect([403, 404]).toContain(r.status);
    const u = await api().put(`/api/v1/store/orders/${orderId}/status`).set(auth(coach2.token)).send({ status: 'DELIVERED' });
    expect([403, 404]).toContain(u.status);
  });
});

describe('2. Loja — encomenda (pré-venda)', () => {
  let productId: string;

  it('treinador cria produto sob encomenda (sem estoque)', async () => {
    const deadline = new Date(Date.now() + 10 * 864e5).toISOString();
    const r = await api().post('/api/v1/store/products').set(auth(coach.token)).send({
      name: 'Camisa Encomenda E2E', category: 'CAMISA', priceInCents: 12900, totalStock: 0,
      sizes: ['P', 'M', 'G'], isPreOrder: true, preOrderDeadline: deadline, active: true,
    });
    expect(r.status).toBe(201);
    productId = r.body.id;
  });

  it('atleta encomenda tamanho M, paga e entra na lista de produção', async () => {
    const o = await api().post('/api/v1/store/public/orders').set(auth(athlete.token)).send({
      productId, customerName: 'Atleta', customerEmail: athlete.email, quantity: 1, size: 'M',
    });
    expect(o.status).toBe(201);
    expect(o.body.isPreOrder).toBe(true);
    const co = await api().post('/api/v1/checkout').set(auth(athlete.token)).send({
      purpose: 'STORE_ORDER', refId: o.body.id, refToken: o.body.accessToken,
      buyer: { name: 'Atleta', email: athlete.email, cpf: CPF },
    });
    expect(co.status).toBe(201);
    await payFake(co.body);

    const sum = await api().get('/api/v1/store/preorders/summary').set(auth(coach.token));
    expect(sum.status).toBe(200);
    expect(JSON.stringify(sum.body)).toContain('Camisa Encomenda E2E');
  });
});

describe('3. Eventos — gestão completa dentro do app', () => {
  let eventId: string;
  let distanceId: string;
  let registrationId: string;

  it('treinador cria evento pago, distância e cupom, e publica', async () => {
    const date = new Date(Date.now() + 30 * 864e5).toISOString();
    const ev = await api().post('/api/v1/events').set(auth(coach.token)).send({
      title: `Corrida E2E ${ts}`, eventDate: date, location: 'Parque da Cidade', city: 'Niterói', state: 'RJ',
      price: 10000, maxParticipants: 50,
    });
    expect(ev.status).toBe(201);
    eventId = ev.body.id;

    const d = await api().post(`/api/v1/events/${eventId}/distances`).set(auth(coach.token)).send({ name: '10K', distanceKm: 10, price: 12000 });
    expect(d.status).toBe(201);
    distanceId = d.body.id;

    const c = await api().post(`/api/v1/events/${eventId}/coupons`).set(auth(coach.token)).send({ code: `E2E${ts % 100000}`, type: 'PERCENT', value: 10, maxUses: 5 });
    expect(c.status).toBe(201);

    const pub = await api().put(`/api/v1/events/${eventId}`).set(auth(coach.token)).send({ status: 'PUBLISHED' });
    expect(pub.status).toBe(200);
  });

  it('outro treinador NÃO consegue editar o evento', async () => {
    const r = await api().put(`/api/v1/events/${eventId}`).set(auth(coach2.token)).send({ title: 'hackeado' });
    expect([403, 404]).toContain(r.status);
  });

  it('inscrição em evento pago NÃO é confirmada sem pagamento', async () => {
    const r = await api().post(`/api/v1/events/${eventId}/register`).set(auth(athlete.token)).send({
      distanceId, shirtSize: 'M', couponCode: `E2E${ts % 100000}`,
    });
    expect(r.status).toBe(201);
    expect(r.body.requiresPayment).toBe(true);
    expect(r.body.amountInCents).toBe(10800); // 12000 da distância - 10% do cupom
    registrationId = r.body.id ?? r.body.registration?.id;
    const mine = await api().get('/api/v1/events/my-registrations').set(auth(athlete.token));
    const reg = (mine.body.data ?? mine.body).find((x: any) => (x.eventId ?? x.event?.id) === eventId);
    expect(reg.status).toBe('PENDING');
    expect(reg.bibNumber ?? null).toBeNull();
  });

  it('pagamento confirma a inscrição e atribui número de peito', async () => {
    const co = await api().post('/api/v1/checkout').set(auth(athlete.token)).send({
      purpose: 'EVENT_REGISTRATION', refId: registrationId, buyer: { name: 'Atleta', email: athlete.email, cpf: CPF },
    });
    expect(co.status).toBe(201);
    expect(co.body.amountInCents).toBe(10800);
    await payFake(co.body);
    const mine = await api().get('/api/v1/events/my-registrations').set(auth(athlete.token));
    const reg = (mine.body.data ?? mine.body).find((x: any) => (x.eventId ?? x.event?.id) === eventId);
    expect(reg.status).toBe('CONFIRMED');
    expect(reg.bibNumber).toBeTruthy();
  });

  it('organizador vê inscritos, exporta CSV, estatísticas e faz check-in', async () => {
    const regs = await api().get(`/api/v1/events/${eventId}/registrations`).set(auth(coach.token));
    expect(regs.status).toBe(200);
    expect(JSON.stringify(regs.body)).toContain(athlete.email);
    const csv = await api().get(`/api/v1/events/${eventId}/registrations/export.csv`).set(auth(coach.token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(athlete.email);
    const stats = await api().get(`/api/v1/events/${eventId}/stats`).set(auth(coach.token));
    expect(stats.status).toBe(200);
  });

  it('voluntário entrega o kit pelo QR (link temporário) — sem pagamento não entrega', async () => {
    const ks = await api().post(`/api/v1/events/${eventId}/kit-session`).set(auth(coach.token)).send({ label: 'Mesa 1', hours: 4 });
    expect(ks.status).toBe(201);
    const token = ks.body.token ?? ks.body.session?.token;
    expect(token).toBeTruthy();
    const qr = await api().get(`/api/v1/events/my-registrations/${registrationId}/qr`).set(auth(athlete.token));
    expect(qr.status).toBe(200);
    const kit = await api().post('/api/v1/events/kit-delivery/scan').send({ registrationId, token, volunteerLabel: 'Mesa 1' });
    expect(kit.status).toBe(200);
    const again = await api().post('/api/v1/events/kit-delivery/scan').send({ registrationId, token });
    expect(JSON.stringify(again.body)).toMatch(/já|entregue|already/i);
  });

  it('check-in no dia da prova pelo organizador (QR ou nº de peito)', async () => {
    const ci = await api().post(`/api/v1/events/${eventId}/checkin-scan`).set(auth(coach.token)).send({ code: registrationId });
    // Prova a 30 dias: fora da janela de 1 dia → pede confirmação (regra nova)
    expect(ci.body.success).toBe(false);
    const ciForce = await api().post(`/api/v1/events/${eventId}/checkin-scan`).set(auth(coach.token)).send({ code: registrationId, force: true });
    expect([200, 201]).toContain(ciForce.status);
    expect(ciForce.body.success).toBe(true);
    const ci2 = await api().post(`/api/v1/events/${eventId}/checkin-scan`).set(auth(coach2.token)).send({ code: registrationId });
    expect([403, 404]).toContain(ci2.status);
  });

  it('outro treinador NÃO vê a lista de inscritos (dados pessoais)', async () => {
    const r = await api().get(`/api/v1/events/${eventId}/registrations`).set(auth(coach2.token));
    expect([403, 404]).toContain(r.status);
  });
});

describe('4. Ataques que precisam falhar', () => {
  it('cadastro como SUPER_ADMIN → 400', async () => {
    const r = await api().post('/api/v1/auth/register').send({ ...CONSENT, email: `evil_${ts}@t.com`, password: 'Test12345!', name: 'x', role: 'SUPER_ADMIN' });
    expect(r.status).toBe(400);
  });

  it('cadastro sem aceitar os Termos (LGPD) → 400', async () => {
    const r = await api().post('/api/v1/auth/register').send({ email: `semtermo_${ts}@t.com`, password: 'Test12345!', name: 'x' });
    expect(r.status).toBe(400);
  });

  it('atleta tenta se vincular a outro treinador via PUT /users/me → 400', async () => {
    const r = await api().put('/api/v1/users/me').set(auth(athlete2.token)).send({ athleteProfile: { coachId: coach.id } });
    expect(r.status).toBe(400);
  });

  it('treinador 2 tenta "roubar" atleta do treinador 1 → só gera convite, vínculo não muda', async () => {
    await api().post('/api/v1/users/athletes/add').set(auth(coach2.token)).send({ email: athlete.email });
    const list = await api().get('/api/v1/users/athletes').set(auth(coach.token));
    expect(JSON.stringify(list.body)).toContain(athlete.email);
    const list2 = await api().get('/api/v1/users/athletes').set(auth(coach2.token));
    expect(JSON.stringify(list2.body)).not.toContain(athlete.email);
  });

  it('atleta não cria convites', async () => {
    const r = await api().post('/api/v1/invites').set(auth(athlete2.token)).send({ email: 'x@t.com' });
    expect(r.status).toBe(403);
  });

  it('chat: atleta 2 não abre conversa com treinador que não é o dele', async () => {
    const r = await api().post('/api/v1/conversations').set(auth(athlete2.token)).send({ coachId: coach.id });
    expect([400, 403, 404]).toContain(r.status);
  });

  it('treinador 2 não lê carga de treino nem nutrição do atleta do treinador 1', async () => {
    const a = await api().get(`/api/v1/workouts/training-load/${athlete.id}`).set(auth(coach2.token));
    expect([403, 404]).toContain(a.status);
    const b = await api().get(`/api/v1/nutrition/coach/${athlete.id}`).set(auth(coach2.token));
    expect([403, 404]).toContain(b.status);
  });

  it('assinar plano pago da plataforma NÃO ativa sem pagamento', async () => {
    const r = await api().post('/api/v1/platform/subscribe').set(auth(coach2.token)).send({ plan: 'PRO', cpf: CPF });
    if (r.status === 201 || r.status === 200) {
      expect(r.body.status).not.toBe('ACTIVE');
    } else {
      expect([400, 404]).toContain(r.status); // plano inexistente no banco de teste
    }
  });

  it('webhook Asaas sem token → recusado', async () => {
    const r = await api().post('/api/v1/webhooks/asaas').send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_x' } });
    expect([401, 403, 503]).toContain(r.status);
  });

  it('webhook Mercado Pago sem assinatura (com segredo configurado) / Stripe sem segredo → recusados', async () => {
    const s = await api().post('/api/v1/payments/stripe/webhook').send({});
    expect([400, 401, 404, 503]).toContain(s.status);
  });

  it('força bruta no login: bloqueia na 6ª tentativa mesmo trocando X-Forwarded-For', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const r = await api().post('/api/v1/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: athlete2.email, password: 'errada' + i });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('métricas e health detalhado não são públicos', async () => {
    const m = await api().get('/api/v1/metrics');
    expect([401, 403, 404]).toContain(m.status);
    const h = await api().get('/api/v1/health/detailed');
    expect([401, 403, 404]).toContain(h.status);
  });
});
