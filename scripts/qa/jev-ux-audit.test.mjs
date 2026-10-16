// node --test scripts/qa/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQuestions, buildRequestBody, buildState, callJev, backoffDelay, redactText, redactDeep,
  evaluateAnswers, errorHelpfulness, renderMarkdown, parseArgs, resolveRoutes, pickPath,
  credentialsFor, evidenceSnippet, sumUsage, PRIMARY_ISSUE_OPTIONS, DEFAULT_API_URL, JevApiError,
} from './jev-ux-audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, 'jev-audit.config.json'), 'utf8'));

// ── helpers ────────────────────────────────────────────────────────────────
function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const OK_BODY = {
  model: 'jev-1.13.0',
  answers: {
    englishOrTechnicalText: { type: 'noul', noul: 0.91 },
    pageShowsErrorState: { type: 'noul', noul: 0.12 },
    deadEnd: { type: 'noul', noul: 0.05 },
    placeholderOrFakeData: { type: 'noul', noul: 0.5 },
    clarityForRole: { type: 'score', score: 0.8, confidence: 0.6, legend: {}, probabilities: { 0: 0.4, 1: 0.4, 2: 0.2, 3: 0, 4: 0 } },
    errorMessageHelpfulness: { type: 'score', score: 1.2, confidence: 0.5, legend: {}, probabilities: { 0: 0.1, 1: 0.6, 2: 0.3, 3: 0, 4: 0 } },
    primaryIssue: { type: 'choice', choice: 'language', confidence: 0.8, probabilities: { language: 0.9, none: 0.1 } },
  },
  usage: { input_tokens: 2100, output_tokens: 40 },
};

const SAMPLE_STATE = buildState({
  role: 'athlete', audience: 'runner', route: '/athlete', finalPath: '/athlete', viewport: '390x844 (mobile-390)',
  title: 'Rafinha Running', headings: ['Olá, Maria'], buttons: ['Salvar', 'Salvar'], links: ['Início'],
  fields: [{ type: 'email', label: 'E-mail', placeholder: 'seu@email.com', required: true }],
  visibleText: 'Olá maria@gmail.com\n\n\nTreino de hoje: undefined km', errors: ['Something went wrong'],
  failedRequests: [{ status: 500, method: 'GET', path: '/api/v1/workouts', message: 'Internal server error' }],
});

// ── request shape ──────────────────────────────────────────────────────────
test('buildQuestions: ids, tipos e criteria seguem o contrato da API', () => {
  const q = buildQuestions();
  assert.deepEqual(Object.keys(q).sort(), ['clarityForRole', 'deadEnd', 'englishOrTechnicalText', 'errorMessageHelpfulness', 'pageShowsErrorState', 'placeholderOrFakeData', 'primaryIssue']);
  for (const id of ['englishOrTechnicalText', 'pageShowsErrorState', 'deadEnd', 'placeholderOrFakeData']) {
    assert.equal(q[id].type, 'noul');
    assert.ok(q[id].instructions);
    assert.equal(typeof q[id].criteria.true, 'string');
    assert.equal(typeof q[id].criteria.false, 'string');
  }
  for (const id of ['clarityForRole', 'errorMessageHelpfulness']) {
    assert.equal(q[id].type, 'score');
    assert.ok(Array.isArray(q[id].criteria));
    assert.equal(q[id].criteria.length, 5);
  }
  assert.match(q.errorMessageHelpfulness.criteria[0], /No error/);
  assert.equal(q.primaryIssue.type, 'choice');
  assert.deepEqual(Object.keys(q.primaryIssue.criteria).sort(), ['confusing_copy', 'data_looks_wrong', 'empty_state_without_guidance', 'error_state', 'language', 'missing_feedback', 'navigation', 'none', 'other']);
  assert.deepEqual(q.primaryIssue.criteria, PRIMARY_ISSUE_OPTIONS);
  // instructions referenciam campos do state com crases
  assert.match(JSON.stringify(q.clarityForRole.instructions), /`audience`/);
});

test('callJev: POST com Bearer, JSON, model jev-latest, state nomeado e 7 perguntas', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return jsonResponse(200, OK_BODY); };
  const body = buildRequestBody(SAMPLE_STATE);
  const { response, attempts } = await callJev(body, { apiKey: 'ts_test_key', fetchImpl });
  assert.equal(attempts, 1);
  assert.equal(response.model, 'jev-1.13.0');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DEFAULT_API_URL);
  assert.equal(DEFAULT_API_URL, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ts_test_key');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, 'jev-latest');
  assert.deepEqual(Object.keys(sent).sort(), ['model', 'questions', 'state']);
  assert.equal(Object.keys(sent.questions).length, 7);
  for (const k of ['role', 'route', 'viewport', 'title', 'headings', 'buttons', 'fields', 'visibleText', 'errors', 'failedRequests']) assert.ok(k in sent.state, k);
  assert.ok(!sent.body?.includes?.('maria@gmail.com'));
  assert.ok(!calls[0].init.body.includes('maria@gmail.com'), 'e-mail não pode sair');
});

test('callJev: sem chave lança erro sem chamar a rede', async () => {
  let called = false;
  await assert.rejects(callJev({}, { apiKey: '', fetchImpl: async () => { called = true; } }), JevApiError);
  assert.equal(called, false);
});

// ── retry ──────────────────────────────────────────────────────────────────
test('callJev: repete em 429 e 529 com backoff exponencial e depois tem sucesso', async () => {
  const seq = [jsonResponse(429, { error: 'rate' }), jsonResponse(529, 'overloaded'), jsonResponse(529, 'overloaded'), jsonResponse(200, OK_BODY)];
  const waits = [];
  const retries = [];
  const fetchImpl = async () => seq.shift();
  const { response, attempts } = await callJev({ model: 'jev-latest' }, {
    apiKey: 'k', fetchImpl, baseDelayMs: 100, random: () => 1, sleep: async (ms) => { waits.push(ms); }, onRetry: (r) => retries.push(r.status),
  });
  assert.equal(attempts, 4);
  assert.equal(response.usage.input_tokens, 2100);
  assert.deepEqual(retries, [429, 529, 529]);
  assert.deepEqual(waits, [100, 200, 400]); // random=1 → teto de cada degrau
});

test('callJev: respeita Retry-After e desiste após maxRetries', async () => {
  const waits = [];
  const fetchImpl = async () => jsonResponse(429, 'slow down', { 'retry-after': '2' });
  await assert.rejects(
    callJev({}, { apiKey: 'k', fetchImpl, maxRetries: 2, sleep: async (ms) => { waits.push(ms); } }),
    (e) => e instanceof JevApiError && e.status === 429,
  );
  assert.deepEqual(waits, [2000, 2000]);
});

test('callJev: não repete em 401/422', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return jsonResponse(422, { detail: 'questions.x.criteria' }); };
  await assert.rejects(callJev({}, { apiKey: 'k', fetchImpl, sleep: async () => {} }), (e) => e.status === 422 && /422/.test(e.message));
  assert.equal(n, 1);
});

test('backoffDelay: cresce exponencialmente com jitter e respeita teto', () => {
  assert.equal(backoffDelay(0, { baseDelayMs: 1000, random: () => 0 }), 500);
  assert.equal(backoffDelay(3, { baseDelayMs: 1000, random: () => 1 }), 8000);
  assert.equal(backoffDelay(10, { baseDelayMs: 1000, maxDelayMs: 30000, random: () => 1 }), 30000);
});

// ── redaction ──────────────────────────────────────────────────────────────
test('redactText: e-mail mantém domínio; CPF, telefone, JWT, dígitos ≥ 6 e segredos somem', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcDEF123_-xyz';
  const s = `Contato: joao.silva@empresa.com.br, CPF 529.982.247-25, cel (21) 99876-5432, token ${jwt}, pedido 1234567, senha Atleta!Local2026, Bearer abcdefghijklmnop123`;
  const r = redactText(s, ['Atleta!Local2026']);
  assert.ok(!r.includes('joao.silva'));
  assert.ok(r.includes('«oculto:email»@empresa.com.br'));
  assert.ok(!r.includes('529.982.247-25'));
  assert.ok(r.includes('«oculto:cpf»'));
  assert.ok(!r.includes('99876-5432'));
  assert.ok(!r.includes('eyJ'));
  assert.ok(!r.includes('1234567'));
  assert.ok(!r.includes('Atleta!Local2026'));
  assert.ok(!r.includes('abcdefghijklmnop123'));
});

test('redactText: preserva textos normais (preços, datas, distâncias curtas)', () => {
  const s = 'Treino 10 km em 21/10/2026 por R$ 149,90 — pace 5:30 min/km, 12345 passos';
  assert.equal(redactText(s), s);
});

test('redactText: dígitos sem formatação (CPF cru, cartão) e UUIDs', () => {
  const r = redactText('cpf 52998224725 cartão 4111111111111111 id 6a04acfc-8ccc-45c5-8f90-8699323bfa75');
  assert.ok(!/\d{6,}/.test(r));
  assert.ok(!r.includes('6a04acfc-8ccc'));
});

test('redactDeep e buildState: redige em profundidade, corta texto e remove duplicadas', () => {
  const deep = redactDeep({ a: ['x@y.com', { b: 'tel +55 21 98765-4321' }], n: 3 });
  assert.equal(deep.a[0], '«oculto:email»@y.com');
  assert.ok(!deep.a[1].b.includes('98765'));
  assert.equal(deep.n, 3);
  const st = buildState({ visibleText: 'a'.repeat(9000), buttons: ['Ok', 'Ok', ' Ok '] }, { maxTextChars: 100 });
  assert.ok(st.visibleText.length < 130);
  assert.match(st.visibleText, /texto cortado/);
  assert.deepEqual(st.buttons, ['Ok']);
  assert.ok(!JSON.stringify(SAMPLE_STATE).includes('maria@gmail.com'));
  assert.ok(JSON.stringify(SAMPLE_STATE).includes('@gmail.com'));
});

// ── threshold / flags ──────────────────────────────────────────────────────
test('evaluateAnswers: noul ≥ 0.7 sinaliza, 0.4–0.7 vai para revisar', () => {
  const ev = evaluateAnswers(OK_BODY.answers, {}, CONFIG.thresholds, CONFIG.severityWeights);
  const ids = ev.flags.map((f) => f.id);
  assert.ok(ids.includes('englishOrTechnicalText'));
  assert.ok(!ids.includes('pageShowsErrorState'));
  assert.ok(ev.review.some((r) => r.id === 'placeholderOrFakeData'));
  assert.ok(ids.includes('clarityForRole'), 'clareza 1.8/5 ≤ 2 sinaliza');
  assert.ok(ids.includes('errorMessageHelpfulness'));
  assert.ok(ids.includes('primaryIssue'));
  assert.equal(ev.primaryIssue.revisar, false);
  assert.equal(ev.severity, 3 + 2 + 2 + 1);
});

test('evaluateAnswers: confiança da choice < 0.5 marca revisar e não sinaliza', () => {
  const ev = evaluateAnswers({ primaryIssue: { type: 'choice', choice: 'navigation', confidence: 0.3, probabilities: {} } });
  assert.equal(ev.flags.length, 0);
  assert.equal(ev.primaryIssue.revisar, true);
  assert.equal(ev.review[0].id, 'primaryIssue');
});

test('evaluateAnswers: clareza alta não sinaliza; limites vêm da config', () => {
  const ans = { clarityForRole: { type: 'score', score: 3.6, confidence: 0.9, probabilities: {} } };
  assert.equal(evaluateAnswers(ans).flags.length, 0);
  assert.equal(evaluateAnswers(ans, {}, { clarityFlagAtOrBelow: 5 }).flags.length, 1);
  const noul = { deadEnd: { type: 'noul', noul: 0.75 } };
  assert.equal(evaluateAnswers(noul, {}, { noulFlag: 0.8 }).flags.length, 0);
});

test('errorHelpfulness: sem mensagem visível não é avaliada', () => {
  assert.equal(errorHelpfulness({ probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } }).helpfulness, null);
  const h = errorHelpfulness({ probabilities: { 0: 0, 1: 0, 2: 0, 3: 0.5, 4: 0.5 } });
  assert.equal(h.helpfulness, 3.5);
  const ev = evaluateAnswers({ errorMessageHelpfulness: { probabilities: { 0: 0.95, 1: 0.05 } } });
  assert.equal(ev.flags.length, 0);
});

test('evaluateAnswers: sinais determinísticos (redirect para login, 5xx)', () => {
  const ev = evaluateAnswers({}, { redirectedToLogin: true, finalPath: '/login', failedRequests: [{ status: 502, method: 'GET', path: '/api/v1/x' }, { status: 404, method: 'GET', path: '/api/v1/y' }] });
  assert.deepEqual(ev.flags.map((f) => f.id), ['redirectedToLogin', 'serverErrors']);
  assert.equal(ev.flags[1].value, 1);
  assert.equal(ev.severity, 4 + 2);
});

// ── report ─────────────────────────────────────────────────────────────────
test('renderMarkdown: resumo por papel, ordenação por gravidade, evidência e tokens', () => {
  const evA = evaluateAnswers(OK_BODY.answers, {});
  const evB = evaluateAnswers({ pageShowsErrorState: { type: 'noul', noul: 0.95 }, deadEnd: { type: 'noul', noul: 0.9 } }, { redirectedToLogin: true, finalPath: '/login' });
  const evC = evaluateAnswers({ clarityForRole: { type: 'score', score: 3.5, confidence: 0.9, probabilities: {} } }, {});
  const results = [
    { role: 'athlete', roleLabel: 'Atleta', route: '/athlete', viewport: 'mobile-390', state: SAMPLE_STATE, response: OK_BODY, evaluation: evA },
    { role: 'owner', roleLabel: 'Dono da equipe', route: '/dashboard/billing', viewport: 'desktop-1366', state: { visibleText: 'Erro ao carregar', errors: ['Falha'] }, response: { usage: { input_tokens: 1000, output_tokens: 30 }, answers: {} }, evaluation: evB },
    { role: 'owner', roleLabel: 'Dono da equipe', route: '/dashboard', viewport: 'desktop-1366', state: { visibleText: 'Tudo certo' }, response: { usage: { input_tokens: 900, output_tokens: 30 }, answers: { clarityForRole: { score: 3.5 } } }, evaluation: evC },
    { role: 'coach', roleLabel: 'Treinador', route: '(todas)', viewport: null, error: 'credenciais ausentes: QA_COACH_EMAIL' },
  ];
  const md = renderMarkdown(results, { baseUrl: 'http://localhost', model: 'jev-latest', generatedAt: '2026-10-15T00:00:00Z' });
  assert.match(md, /## Resumo por papel/);
  assert.match(md, /\| Atleta \| 1 \| 1 \|/);
  assert.match(md, /\| Dono da equipe \| 2 \| 1 \|/);
  const iBilling = md.indexOf('### /dashboard/billing');
  const iAthlete = md.indexOf('### /athlete');
  assert.ok(iBilling > 0 && iAthlete > iBilling, 'mais grave primeiro');
  assert.match(md, /Tela de erro/);
  assert.match(md, /Something went wrong/);
  assert.match(md, /500 GET \/api\/v1\/workouts/);
  assert.match(md, /\| 3 \| 4000 \| 100 \| 4100 \|/);
  assert.match(md, /não informado/);
  assert.match(md, /Capturas que falharam \(1\)/);
  assert.ok(!md.includes('maria@gmail.com'));
});

test('evidenceSnippet e sumUsage', () => {
  const ev = evidenceSnippet({ visibleText: 'Seu treino: undefined km hoje' });
  assert.match(ev, /undefined/);
  assert.deepEqual(sumUsage([{ response: { usage: { input_tokens: 5, output_tokens: 1 } } }, { error: 'x' }]), { input_tokens: 5, output_tokens: 1, requests: 1 });
});

// ── config / cli ───────────────────────────────────────────────────────────
test('parseArgs: flags e padrões', () => {
  const d = parseArgs([]);
  assert.equal(d.dryRun, false);
  assert.equal(d.concurrency, 3);
  assert.equal(d.maxPages, Infinity);
  const o = parseArgs(['--dry-run', '--max-pages', '5', '--concurrency=2', '--roles', 'athlete,owner']);
  assert.equal(o.dryRun, true);
  assert.equal(o.maxPages, 5);
  assert.equal(o.concurrency, 2);
  assert.deepEqual(o.roles, ['athlete', 'owner']);
  assert.throws(() => parseArgs(['--nope']));
});

test('config: papéis, extends do dono, rotas pedidas e nenhuma senha no arquivo', () => {
  assert.deepEqual(Object.keys(CONFIG.roles).sort(), ['athlete', 'coach', 'owner', 'public']);
  const owner = resolveRoutes(CONFIG, 'owner').map((r) => r.path);
  for (const p of ['/dashboard/equipe', '/dashboard/mensalidades', '/dashboard/billing', '/dashboard/loja', '/dashboard/events', '/dashboard/athletes']) assert.ok(owner.includes(p), p);
  assert.equal(new Set(owner).size, owner.length);
  const ath = resolveRoutes(CONFIG, 'athlete').map((r) => r.path);
  for (const p of ['/athlete', '/athlete-subscribe', '/dashboard/chat', '/privacidade/meus-dados', '/loja', '/eventos/{id}']) assert.ok(ath.includes(p), p);
  const pub = resolveRoutes(CONFIG, 'public').map((r) => r.path);
  for (const p of ['/', '/landing', '/pricing', '/loja', '/termos', '/privacidade', '/login', '/register', '/athlete-register', '/forgot-password']) assert.ok(pub.includes(p), p);
  const raw = readFileSync(join(HERE, 'jev-audit.config.json'), 'utf8');
  assert.ok(!/Local2026|"password"\s*:/i.test(raw));
  assert.equal(CONFIG.thresholds.noulFlag, 0.7);
});

test('credentialsFor e pickPath', () => {
  const role = { login: { envPrefix: 'QA_OWNER' } };
  assert.deepEqual(credentialsFor(role, {}).missing, ['QA_OWNER_EMAIL', 'QA_OWNER_PASSWORD']);
  assert.deepEqual(credentialsFor(role, { QA_OWNER_EMAIL: 'a@b.c', QA_OWNER_PASSWORD: 'p' }), { email: 'a@b.c', password: 'p' });
  assert.equal(credentialsFor({ login: null }), null);
  assert.equal(pickPath({ data: [{ id: 'x' }] }, 'data[0].id'), 'x');
  assert.equal(pickPath({}, 'data[0].id'), undefined);
});
