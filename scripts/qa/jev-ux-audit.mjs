#!/usr/bin/env node
// Auditoria de UX de todas as páginas do app com o modelo Jev (TypeSafe System One).
//
//   node scripts/qa/jev-ux-audit.mjs --dry-run            # só captura e grava out/requests.jsonl (sem custo)
//   node scripts/qa/jev-ux-audit.mjs                      # captura + pergunta ao Jev + relatório
//
// Opções: --config <arquivo> --base-url <url> --max-pages <n> --concurrency <n> (padrão 3)
//         --roles athlete,owner   --viewports mobile-390,desktop-1366   --out <pasta>
//
// Ambiente: TYPESAFE_API_KEY, QA_<PAPEL>_EMAIL / QA_<PAPEL>_PASSWORD, PW_CHROMIUM_PATH (opcional),
//           QA_BASE_URL (opcional). Lidos do ambiente ou do .env na raiz do repositório.
// Docs da API: https://docs.typesafe.ai/api.md — chamada HTTP direta com fetch (sem SDK).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const DEFAULT_API_URL = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';

// ────────────────────────────────────────────────────────────────────────────
// Redação de dados pessoais (LGPD) — aplicada ao state ANTES de qualquer envio
// ────────────────────────────────────────────────────────────────────────────

export const REDACTION_MARKERS = ['«oculto:segredo»', '«oculto:jwt»', '«oculto:email»', '«oculto:cpf»', '«oculto:cnpj»', '«oculto:telefone»', '«oculto:token»', '«oculto:número»'];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const PHONE_RE = /(?:\+?55\s?)?\(\d{2}\)\s?9?\d{4}[-\s]?\d{4}\b|(?:\+?55\s?)\d{2}\s?9?\d{4}[-\s]?\d{4}\b|\b9\d{4}-\d{4}\b/g;
// Tokens longos (hex/base64/UUID) — exige letra e dígito para não pegar palavras comuns.
const TOKEN_RE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g;
const DIGITS_RE = /\d{6,}/g;

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Redige uma string: segredos literais, JWT, e-mails (mantém domínio), CPF/CNPJ, telefones, tokens, dígitos ≥ 6. */
export function redactText(text, secrets = []) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const s of secrets) {
    if (typeof s === 'string' && s.length >= 4) out = out.replace(new RegExp(escapeRegExp(s), 'g'), '«oculto:segredo»');
  }
  out = out.replace(JWT_RE, '«oculto:jwt»');
  out = out.replace(BEARER_RE, 'Bearer «oculto:token»');
  out = out.replace(EMAIL_RE, (_m, domain) => `«oculto:email»@${domain}`);
  out = out.replace(CNPJ_RE, '«oculto:cnpj»');
  out = out.replace(CPF_RE, '«oculto:cpf»');
  out = out.replace(PHONE_RE, '«oculto:telefone»');
  out = out.replace(TOKEN_RE, '«oculto:token»');
  out = out.replace(DIGITS_RE, '«oculto:número»');
  return out;
}

/** Aplica redactText recursivamente em strings de objetos/arrays (chaves não são alteradas). */
export function redactDeep(value, secrets = []) {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value && typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = redactDeep(v, secrets);
    return o;
  }
  return value;
}

// ────────────────────────────────────────────────────────────────────────────
// Perguntas para o Jev (instruções em inglês: idioma principal de treino do modelo;
// o conteúdo da página, no state, fica em português).
// ────────────────────────────────────────────────────────────────────────────

const STATE_CONTEXT =
  'The state describes ONE page of "Rafinha Running", a Brazilian Portuguese web app for running coaches and their athletes, ' +
  'as seen by the person described in `audience` (acting as `role`) at screen size `viewport`. ' +
  '`visibleText` is the text rendered on screen; `headings`, `buttons`, `links`, `fields` and `errors` are the visible headings, buttons, links, form fields and error/toast messages. ' +
  '`failedRequests` are API calls that failed while the page loaded (diagnostic data, not shown to the user). ' +
  'Markers like «oculto:email», «oculto:número», «oculto:cpf», «oculto:telefone», «oculto:token» replace personal data removed for privacy; they are NOT part of the real page and are never a problem.';

// A descrição dos campos vai UMA vez no state (campo `about`) em vez de repetida em cada pergunta (economiza ~5 KB/requisição).
export const STATE_ABOUT = STATE_CONTEXT;
const CONTEXT_REF = 'Read `about` first: it explains what this app is and what each state field means.';

export const PRIMARY_ISSUE_OPTIONS = {
  none: 'No notable UX problem: the page does its job for this audience.',
  language: 'Text shown in English or developer/technical wording instead of plain Brazilian Portuguese.',
  error_state: 'The page shows an error, crash, "not found", "access denied" or failed-to-load screen instead of its content.',
  confusing_copy: 'Content renders, but titles, labels or explanations are vague, contradictory, full of jargon, or do not tell the user what the page is for.',
  missing_feedback: 'The user cannot tell what happened or what is going on: no loading, success, or status message where one is needed.',
  navigation: 'The user cannot find where to go next or how to go back; missing or misleading links/buttons.',
  empty_state_without_guidance: 'A list or section is empty ("nenhum…", "sem dados") with no explanation of why or what to do to fill it.',
  data_looks_wrong: 'Displayed data looks incorrect or inconsistent: impossible values, NaN, wrong dates, negative or zero totals that make no sense, duplicated items.',
  other: 'A clear UX problem that fits none of the options above.',
};

export function buildQuestions() {
  return {
    englishOrTechnicalText: {
      type: 'noul',
      instructions: {
        context: CONTEXT_REF,
        question: 'Does the user-visible text (`visibleText`, `headings`, `buttons`, `links`, `fields`, `errors`) contain English words or sentences, or technical/developer error text, where plain Brazilian Portuguese is expected?',
        ignore: [
          'brand and product names (Rafinha Running, Strava, Garmin, Polar, Coros, WhatsApp, Google, Apple, Pix, Instagram)',
          'loanwords normal in Brazilian Portuguese: e-mail, app, login, logout, online, link, site, check-in, kit, pace, feedback, ranking, live, dashboard, chat, QR code, PDF, download, upload, Wi-Fi',
          'units and abbreviations: km, m, min/km, bpm, kcal, h, R$',
          'privacy markers such as «oculto:email»',
          '`failedRequests`, which the user does not see',
        ],
      },
      criteria: {
        true: "At least one visible string is in English (e.g. 'Loading...', 'Submit', 'No data', 'Something went wrong', 'Save changes') or is developer text: stack traces, 'Unexpected token', 'undefined', 'null', 'NaN', 'Internal server error', 'Bad Request', raw HTTP status codes like '500' or '404 Not Found', raw JSON, error codes like 'ERR_NETWORK'.",
        false: 'All visible text is Brazilian Portuguese, apart from the ignored brand names, common loanwords, units and privacy markers.',
      },
    },
    pageShowsErrorState: {
      type: 'noul',
      instructions: {
        context: CONTEXT_REF,
        question: 'Is the page showing an error or failure state to the user instead of its normal content?',
      },
      criteria: {
        true: "The main content is replaced or dominated by a failure: crash screen ('Application error', 'Algo deu errado'), 'página não encontrada'/404, 'acesso negado'/'sem permissão', a 'não foi possível carregar' message where the data should be, or only a loading indicator with no content.",
        false: 'The normal content of the page is shown. Small inline form-validation hints, or failed background requests that leave no visible trace, do not count.',
      },
    },
    deadEnd: {
      type: 'noul',
      instructions: {
        context: CONTEXT_REF,
        question: 'Is the user stuck on this page with no clear next action: no button or link to proceed, retry, or go back / navigate elsewhere?',
      },
      criteria: {
        true: 'No usable way forward or out: e.g. an error or empty message with no button or link, a confirmation screen with nothing to click, or only disabled controls.',
        false: 'At least one clear action exists that moves the user forward or lets them leave: a navigation menu, a back link, a primary button, a form to submit, or links to other pages.',
      },
    },
    clarityForRole: {
      type: 'score',
      instructions: {
        context: CONTEXT_REF,
        question: 'How clear is this page for the person described in `audience`, judging only from the text and controls they see?',
      },
      criteria: [
        'Incomprehensible for this person: the purpose of the page cannot be told, or the screen is dominated by errors, raw data, or jargon they would not know.',
        'Hard to understand: the purpose can be guessed, but key labels are vague, technical or contradictory, and this person would likely need help to act.',
        'Understandable with effort: the purpose is clear, but they must read carefully; some unexplained terms, cluttered text, or an unclear next step.',
        'Clear: the purpose and the main action are evident; only minor wording issues.',
        'Very clear: the purpose, the current status and the next action are obvious at a glance, in plain language suited to this person.',
      ],
    },
    errorMessageHelpfulness: {
      type: 'score',
      instructions: {
        context: CONTEXT_REF,
        question: 'If an error, warning or failure message is visible to the user (in `errors` or `visibleText`), how much does it help them understand and recover?',
      },
      criteria: [
        'No error, warning or failure message is visible anywhere on the page (failed background requests that show nothing to the user count as no message).',
        'An error message is visible but useless to the user: raw technical text, a bare code or status number, English developer text, or a message that blames the user without saying what happened.',
        "An error message is visible but vague: it says something failed ('Erro', 'Algo deu errado', 'Tente novamente') without saying what went wrong or what to do.",
        'An error message explains in plain Portuguese what went wrong, but gives no concrete way to fix it or continue.',
        'An error message explains in plain Portuguese what went wrong and tells the user exactly what to do next (fix a named field, a retry button, a contact link).',
      ],
    },
    primaryIssue: {
      type: 'choice',
      instructions: {
        context: CONTEXT_REF,
        question: "What is the single most important UX problem on this page for the person described in `audience`? Choose 'none' if there is no notable problem.",
      },
      criteria: { ...PRIMARY_ISSUE_OPTIONS },
    },
    placeholderOrFakeData: {
      type: 'noul',
      instructions: {
        context: CONTEXT_REF,
        question: 'Does the page show placeholder, unfinished, or fake/test content to the user where real content belongs?',
        ignore: ['privacy markers such as «oculto:email» or «oculto:número»', 'input placeholders inside `fields` that only hint what to type (e.g. "Digite seu e-mail")'],
      },
      criteria: {
        true: "Examples: 'não informado' or '—' standing in for required business information, 'lorem ipsum', bracketed template fields like '[RAZÃO SOCIAL]' or '[CNPJ]', 'TODO', 'XXX', 'teste', 'test', 'demo', 'QA', 'foo', 'asdf', example.com, or obviously fake values (R$ 0,00 prices, 01/01/1970 dates).",
        false: 'The visible content looks like real, finished product content.',
      },
    },
  };
}

/** Monta o corpo da requisição POST /v1/systemone (uma requisição por página × viewport). */
export function buildRequestBody(state, { model = DEFAULT_MODEL, questions = buildQuestions() } = {}) {
  return { model, state, questions };
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente HTTP (fetch puro) com retry exponencial para 429/529
// ────────────────────────────────────────────────────────────────────────────

export class JevApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'JevApiError';
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE = new Set([429, 529, 500, 502, 503, 504]);
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function backoffDelay(attempt, { baseDelayMs = 1000, maxDelayMs = 30000, random = Math.random, retryAfter } = {}) {
  if (retryAfter != null) {
    const s = Number(retryAfter);
    if (Number.isFinite(s) && s >= 0) return Math.min(maxDelayMs, s * 1000);
  }
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2)); // "equal jitter"
}

/**
 * Chama o Jev. Repete com backoff exponencial em 429/529 (e 5xx/erro de rede).
 * Retorna { response, attempts }.
 */
export async function callJev(body, {
  apiKey,
  apiUrl = DEFAULT_API_URL,
  fetchImpl = globalThis.fetch,
  maxRetries = 5,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  timeoutMs = 60000,
  sleep = defaultSleep,
  random = Math.random,
  onRetry = () => {},
} = {}) {
  if (!apiKey) throw new JevApiError('TYPESAFE_API_KEY ausente');
  const payload = JSON.stringify(body);
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: payload,
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (err) {
      if (attempt >= maxRetries) throw new JevApiError(`Falha de rede ao chamar o Jev: ${err.message}`);
      const wait = backoffDelay(attempt, { baseDelayMs, maxDelayMs, random });
      onRetry({ attempt: attempt + 1, status: 'network', wait });
      await sleep(wait);
      attempt++;
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      return { response: json, attempts: attempt + 1 };
    }
    const text = await res.text().catch(() => '');
    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      const retryAfter = res.headers?.get?.('retry-after');
      const wait = backoffDelay(attempt, { baseDelayMs, maxDelayMs, random, retryAfter });
      onRetry({ attempt: attempt + 1, status: res.status, wait });
      await sleep(wait);
      attempt++;
      continue;
    }
    const hint = { 401: 'chave inválida ou ausente', 413: 'requisição grande demais', 422: 'pergunta/estado inválido', 429: 'limite de taxa', 529: 'serviço sobrecarregado' }[res.status] || '';
    throw new JevApiError(`Jev respondeu HTTP ${res.status}${hint ? ` (${hint})` : ''}: ${text.slice(0, 500)}`, { status: res.status, body: text });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Regras de sinalização (política explícita em código; respostas brutas ficam no JSON)
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS = {
  noulFlag: 0.7,
  noulReview: 0.4,
  clarityFlagAtOrBelow: 2.0,
  errorHelpfulnessFlagAtOrBelow: 2.0,
  errorMessagePresentMin: 0.5,
  choiceReviewBelow: 0.5,
  scoreReviewBelow: 0.3,
};

export const DEFAULT_WEIGHTS = {
  pageShowsErrorState: 5,
  redirectedToLogin: 4,
  englishOrTechnicalText: 3,
  deadEnd: 3,
  clarityForRole: 2,
  errorMessageHelpfulness: 2,
  serverErrors: 2,
  placeholderOrFakeData: 1,
  primaryIssue: 1,
};

export const NOUL_IDS = ['pageShowsErrorState', 'englishOrTechnicalText', 'deadEnd', 'placeholderOrFakeData'];

export const LABELS_PT = {
  pageShowsErrorState: 'Tela de erro',
  englishOrTechnicalText: 'Inglês / texto técnico',
  deadEnd: 'Beco sem saída',
  placeholderOrFakeData: 'Placeholder / dado falso',
  clarityForRole: 'Clareza para o papel',
  errorMessageHelpfulness: 'Mensagem de erro pouco útil',
  primaryIssue: 'Problema principal',
  redirectedToLogin: 'Redirecionou para o login',
  serverErrors: 'Erros 5xx na API',
};

export const ISSUE_PT = {
  none: 'nenhum',
  language: 'idioma',
  error_state: 'tela de erro',
  confusing_copy: 'texto confuso',
  missing_feedback: 'falta de feedback',
  navigation: 'navegação',
  empty_state_without_guidance: 'lista vazia sem orientação',
  data_looks_wrong: 'dados parecem errados',
  other: 'outro',
};

/** Score do Jev (0..N-1) → escala exibida 1..5 (para 5 níveis). */
export function toDisplayScore(score) { return Number.isFinite(score) ? score + 1 : null; }

/**
 * errorMessageHelpfulness: nível 0 = "nenhuma mensagem de erro visível".
 * Retorna { present: P(há mensagem), helpfulness: média condicional nos níveis 1..4 exibida em 1..4 } ou helpfulness null.
 */
export function errorHelpfulness(answer, minPresent = 0.5) {
  const probs = answer?.probabilities;
  if (!probs) return { present: null, helpfulness: null };
  const p0 = Number(probs['0'] ?? 0);
  const present = 1 - p0;
  if (present < minPresent) return { present, helpfulness: null };
  let num = 0;
  for (const [k, v] of Object.entries(probs)) {
    const lvl = Number(k);
    if (lvl >= 1) num += lvl * Number(v);
  }
  return { present, helpfulness: present > 0 ? num / present : null };
}

/**
 * Avalia uma resposta do Jev + sinais determinísticos da captura.
 * Retorna { flags:[{id,label,value,detail}], review:[{id,label,value}], severity, primaryIssue }.
 */
export function evaluateAnswers(answers, capture = {}, thresholds = DEFAULT_THRESHOLDS, weights = DEFAULT_WEIGHTS) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const flags = [];
  const review = [];
  const a = answers || {};

  for (const id of NOUL_IDS) {
    const p = a[id]?.noul;
    if (!Number.isFinite(p)) continue;
    if (p >= t.noulFlag) flags.push({ id, label: LABELS_PT[id], value: round(p), detail: `P(sim)=${round(p)}` });
    else if (p >= t.noulReview) review.push({ id, label: LABELS_PT[id], value: round(p), detail: `P(sim)=${round(p)} (incerto)` });
  }

  const clarity = a.clarityForRole;
  if (clarity && Number.isFinite(clarity.score)) {
    const disp = toDisplayScore(clarity.score);
    if (disp <= t.clarityFlagAtOrBelow) flags.push({ id: 'clarityForRole', label: LABELS_PT.clarityForRole, value: round(disp), detail: `${round(disp)}/5` });
    else if (Number.isFinite(clarity.confidence) && clarity.confidence < t.scoreReviewBelow) review.push({ id: 'clarityForRole', label: LABELS_PT.clarityForRole, value: round(disp), detail: `${round(disp)}/5, confiança ${round(clarity.confidence)}` });
  }

  const eh = errorHelpfulness(a.errorMessageHelpfulness, t.errorMessagePresentMin);
  if (eh.helpfulness != null && eh.helpfulness <= t.errorHelpfulnessFlagAtOrBelow) {
    flags.push({ id: 'errorMessageHelpfulness', label: LABELS_PT.errorMessageHelpfulness, value: round(eh.helpfulness), detail: `${round(eh.helpfulness)}/4 (P(há mensagem)=${round(eh.present)})` });
  }

  let primaryIssue = null;
  const pi = a.primaryIssue;
  if (pi && pi.choice) {
    const conf = Number(pi.confidence);
    primaryIssue = { choice: pi.choice, label: ISSUE_PT[pi.choice] || pi.choice, confidence: round(conf), revisar: Number.isFinite(conf) && conf < t.choiceReviewBelow };
    if (primaryIssue.revisar) review.push({ id: 'primaryIssue', label: LABELS_PT.primaryIssue, value: pi.choice, detail: `${primaryIssue.label}, confiança ${round(conf)} → revisar` });
    else if (pi.choice !== 'none') flags.push({ id: 'primaryIssue', label: LABELS_PT.primaryIssue, value: pi.choice, detail: `${primaryIssue.label} (confiança ${round(conf)})` });
  }

  if (capture.redirectedToLogin) flags.push({ id: 'redirectedToLogin', label: LABELS_PT.redirectedToLogin, value: true, detail: `acabou em ${capture.finalPath}` });
  const server = (capture.failedRequests || []).filter((r) => r.status >= 500);
  if (server.length) flags.push({ id: 'serverErrors', label: LABELS_PT.serverErrors, value: server.length, detail: server.slice(0, 3).map((r) => `${r.status} ${r.method} ${r.path}`).join('; ') });

  // Severidade: soma dos pesos das sinalizações; "primaryIssue" sozinho não torna a página grave.
  let severity = 0;
  for (const f of flags) severity += Number(w[f.id] ?? 1);
  return { flags, review, severity, primaryIssue };
}

function round(n, d = 2) { return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : n; }

// ────────────────────────────────────────────────────────────────────────────
// Evidência e relatório
// ────────────────────────────────────────────────────────────────────────────

const SUSPICIOUS_RE = /\b(undefined|null|NaN|Error|Unexpected token|Internal Server Error|Bad Request|Not Found|Unauthorized|Forbidden|Loading|Submit|Cancel|Save|Something went wrong|lorem ipsum|TODO|não informado|\[[A-ZÁÉÍÓÚÇÃÕ ]{3,})/gi;

export function evidenceSnippet(state, maxLen = 400) {
  const parts = [];
  if (state?.errors?.length) parts.push('Erros visíveis: ' + state.errors.slice(0, 3).join(' | '));
  if (state?.failedRequests?.length) parts.push('API: ' + state.failedRequests.slice(0, 3).map((r) => `${r.status} ${r.method} ${r.path}${r.message ? ` — ${r.message}` : ''}`).join(' | '));
  const text = state?.visibleText || '';
  const hits = [];
  for (const m of text.matchAll(SUSPICIOUS_RE)) {
    if (hits.length >= 3) break;
    const s = Math.max(0, m.index - 50);
    hits.push('…' + text.slice(s, m.index + m[0].length + 50).replace(/\s+/g, ' ').trim() + '…');
  }
  if (hits.length) parts.push('Trechos: ' + hits.join(' '));
  if (!parts.length && text) parts.push('Início do texto: ' + text.slice(0, 220).replace(/\s+/g, ' ').trim() + (text.length > 220 ? '…' : ''));
  const out = parts.join('\n');
  return out.length > maxLen ? out.slice(0, maxLen) + '…' : out;
}

function mdEscape(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }

export function sumUsage(results) {
  const u = { input_tokens: 0, output_tokens: 0, requests: 0 };
  for (const r of results) {
    if (r.response?.usage) {
      u.input_tokens += Number(r.response.usage.input_tokens || 0);
      u.output_tokens += Number(r.response.usage.output_tokens || 0);
      u.requests++;
    }
  }
  return u;
}

/** Relatório em português. `results`: [{role, roleLabel, route, viewport, finalPath, state, response, evaluation, error}] */
export function renderMarkdown(results, meta = {}) {
  const lines = [];
  const usage = sumUsage(results);
  const ok = results.filter((r) => r.evaluation);
  const failed = results.filter((r) => !r.evaluation);
  lines.push('# Auditoria de UX com Jev (TypeSafe)');
  lines.push('');
  lines.push(`- Gerado em: ${meta.generatedAt || new Date().toISOString()}`);
  lines.push(`- Modelo: ${meta.model || DEFAULT_MODEL}${meta.modelsSeen?.length ? ` (respondido por: ${meta.modelsSeen.join(', ')})` : ''}`);
  lines.push(`- Endereço auditado: ${meta.baseUrl || 'não informado'}`);
  lines.push(`- Capturas avaliadas: ${ok.length} · com falha: ${failed.length}`);
  lines.push('');
  lines.push('> Como ler: cada linha é uma página vista num tamanho de tela (390px = celular, 1366px = computador). ' +
    '"Sinalizada" = passou de algum limite do arquivo de configuração. "Revisar" = o modelo ficou em dúvida — vale um olho humano. ' +
    'Clareza vai de 1 (incompreensível) a 5 (muito clara).');
  lines.push('');

  // Resumo por papel
  lines.push('## Resumo por papel');
  lines.push('');
  lines.push('| Papel | Capturas | Sinalizadas | Revisar | Tela de erro | Inglês/técnico | Beco sem saída | Placeholder | Clareza média (1–5) |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const roles = [...new Set(results.map((r) => r.role))];
  for (const role of roles) {
    const rs = ok.filter((r) => r.role === role);
    const all = results.filter((r) => r.role === role);
    const has = (id) => rs.filter((r) => r.evaluation.flags.some((f) => f.id === id)).length;
    const clar = rs.map((r) => toDisplayScore(r.response?.answers?.clarityForRole?.score)).filter(Number.isFinite);
    const avg = clar.length ? round(clar.reduce((s, x) => s + x, 0) / clar.length, 1) : 'não informado';
    lines.push(`| ${mdEscape(all[0]?.roleLabel || role)} | ${all.length} | ${rs.filter((r) => r.evaluation.flags.length).length} | ${rs.filter((r) => r.evaluation.review.length).length} | ${has('pageShowsErrorState')} | ${has('englishOrTechnicalText')} | ${has('deadEnd')} | ${has('placeholderOrFakeData')} | ${avg} |`);
  }
  lines.push('');

  // Páginas sinalizadas
  const flagged = ok.filter((r) => r.evaluation.flags.length).sort((a, b) => b.evaluation.severity - a.evaluation.severity || a.route.localeCompare(b.route));
  lines.push(`## Páginas sinalizadas (${flagged.length}), da mais grave para a menos grave`);
  lines.push('');
  if (!flagged.length) lines.push('Nenhuma página passou dos limites configurados.');
  for (const r of flagged) {
    lines.push(`### ${mdEscape(r.route)} — ${mdEscape(r.roleLabel || r.role)} · ${r.viewport} · gravidade ${r.evaluation.severity}`);
    lines.push('');
    if (r.finalPath && r.finalPath !== r.route) lines.push(`- Endereço final: \`${r.finalPath}\``);
    for (const f of r.evaluation.flags) lines.push(`- **${f.label}**: ${mdEscape(f.detail)}`);
    for (const v of r.evaluation.review) lines.push(`- _Revisar_ — ${v.label}: ${mdEscape(v.detail)}`);
    const ev = evidenceSnippet(r.state);
    if (ev) {
      lines.push('');
      lines.push('```text');
      lines.push(ev.replace(/```/g, "'''"));
      lines.push('```');
    }
    lines.push('');
  }

  // Revisar (sem sinalização)
  const onlyReview = ok.filter((r) => !r.evaluation.flags.length && r.evaluation.review.length);
  if (onlyReview.length) {
    lines.push(`## Para revisar (modelo em dúvida, ${onlyReview.length})`);
    lines.push('');
    lines.push('| Página | Papel | Tela | Motivo |');
    lines.push('|---|---|---|---|');
    for (const r of onlyReview) lines.push(`| ${mdEscape(r.route)} | ${mdEscape(r.roleLabel || r.role)} | ${r.viewport} | ${mdEscape(r.evaluation.review.map((v) => `${v.label}: ${v.detail}`).join('; '))} |`);
    lines.push('');
  }

  if (failed.length) {
    lines.push(`## Capturas que falharam (${failed.length})`);
    lines.push('');
    lines.push('| Página | Papel | Tela | Erro |');
    lines.push('|---|---|---|---|');
    for (const r of failed) lines.push(`| ${mdEscape(r.route)} | ${mdEscape(r.roleLabel || r.role)} | ${r.viewport || '—'} | ${mdEscape(String(r.error || 'não informado').slice(0, 200))} |`);
    lines.push('');
  }

  lines.push('## Uso de tokens');
  lines.push('');
  lines.push('| Requisições respondidas | Tokens de entrada | Tokens de saída | Total | Média por requisição |');
  lines.push('|---:|---:|---:|---:|---:|');
  const total = usage.input_tokens + usage.output_tokens;
  lines.push(`| ${usage.requests} | ${usage.input_tokens} | ${usage.output_tokens} | ${total} | ${usage.requests ? Math.round(total / usage.requests) : 'não informado'} |`);
  lines.push('');
  lines.push('Custo em R$/US$: não informado — o preço por token não é publicado na documentação consultada; confira no console da TypeSafe.');
  lines.push('');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Configuração, ambiente e argumentos
// ────────────────────────────────────────────────────────────────────────────

/** Carrega TYPESAFE_API_KEY, QA_* e PW_CHROMIUM_PATH do .env.qa e do .env da raiz (sem sobrescrever o ambiente). */
export function loadDotEnv(file = join(REPO_ROOT, '.env'), env = process.env) {
  if (!existsSync(file)) return [];
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  const loaded = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k === 'TYPESAFE_API_KEY' || k === 'PW_CHROMIUM_PATH' || k.startsWith('QA_'))) continue;
    if (env[k] === undefined || env[k] === '') { env[k] = v; loaded.push(k); }
  }
  return loaded;
}

export function parseArgs(argv) {
  const o = { dryRun: false, maxPages: Infinity, concurrency: 3, config: join(HERE, 'jev-audit.config.json'), out: join(HERE, 'out'), roles: null, viewports: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`Faltou valor para ${a}`); return v; };
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const val = () => (inline !== undefined ? inline : next());
    switch (flag) {
      case '--dry-run': o.dryRun = true; break;
      case '--max-pages': o.maxPages = Math.max(1, parseInt(val(), 10)); break;
      case '--concurrency': o.concurrency = Math.max(1, parseInt(val(), 10)); break;
      case '--config': o.config = resolve(val()); break;
      case '--out': o.out = resolve(val()); break;
      case '--roles': o.roles = val().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--viewports': o.viewports = val().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--base-url': o.baseUrl = val().replace(/\/+$/, ''); break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`Opção desconhecida: ${a}`);
    }
  }
  if (!Number.isFinite(o.concurrency)) o.concurrency = 3;
  return o;
}

/** Resolve a lista de rotas de um papel (com "extends"), removendo duplicadas. */
export function resolveRoutes(config, roleName, seen = new Set()) {
  const role = config.roles?.[roleName];
  if (!role) throw new Error(`Papel desconhecido: ${roleName}`);
  if (seen.has(roleName)) throw new Error(`"extends" circular em ${roleName}`);
  seen.add(roleName);
  const base = role.extends ? resolveRoutes(config, role.extends, seen) : [];
  const out = [];
  const keys = new Set();
  for (const r of [...base, ...(role.routes || [])]) {
    const obj = typeof r === 'string' ? { path: r } : r;
    if (keys.has(obj.path)) continue;
    keys.add(obj.path);
    out.push(obj);
  }
  return out;
}

export function pickPath(obj, path) {
  let cur = obj;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function credentialsFor(role, env = process.env) {
  if (!role.login) return null;
  const p = role.login.envPrefix;
  const email = env[`${p}_EMAIL`];
  const password = env[`${p}_PASSWORD`];
  if (!email || !password) return { missing: [`${p}_EMAIL`, `${p}_PASSWORD`].filter((k) => !env[k]) };
  return { email, password };
}

/** Limita texto e listas e aplica redação. Gera o state final enviado ao Jev. */
export function buildState(raw, { maxTextChars = 7000, maxListItems = 40, secrets = [] } = {}) {
  const cap = (arr) => [...new Set((arr || []).map((s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s)).filter(Boolean))].slice(0, maxListItems);
  let text = (raw.visibleText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  if (text.length > maxTextChars) text = text.slice(0, maxTextChars) + ' …[texto cortado]';
  const state = {
    about: STATE_ABOUT,
    role: raw.role,
    audience: raw.audience,
    route: raw.route,
    finalPath: raw.finalPath,
    viewport: raw.viewport,
    title: raw.title || '',
    headings: cap(raw.headings),
    buttons: cap(raw.buttons),
    links: cap(raw.links),
    fields: (raw.fields || []).slice(0, maxListItems),
    visibleText: text,
    errors: cap(raw.errors),
    failedRequests: (raw.failedRequests || []).slice(0, 20),
  };
  return redactDeep(state, secrets);
}

// ────────────────────────────────────────────────────────────────────────────
// Captura com Playwright (não coberta por teste unitário; validada no --dry-run)
// ────────────────────────────────────────────────────────────────────────────

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try { return await import(pathToFileURL(join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs')).href); }
    catch { throw new Error('Playwright não encontrado. Rode "pnpm install" na raiz e depois "npx playwright install chromium".'); }
  }
}

function contextOptions(vp, storageState) {
  return {
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ...(storageState ? { storageState } : {}),
  };
}

async function acceptConsentIfShown(page) {
  const dlg = page.locator('[role=dialog]');
  if (!(await dlg.count().catch(() => 0))) return false;
  const txt = await dlg.first().innerText().catch(() => '');
  if (!/termos|política|privacidade|consent/i.test(txt)) return false;
  const boxes = dlg.locator('input[type=checkbox]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const lbl = await boxes.nth(i).evaluate((e) => e.closest('label')?.innerText || '').catch(() => '');
    if (!/novidades|opcional|marketing/i.test(lbl)) await boxes.nth(i).check().catch(() => {});
  }
  await dlg.getByRole('button', { name: /aceitar|continuar|concordo/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

async function login(browser, baseUrl, role, creds, vp, cfg) {
  const ctx = await browser.newContext(contextOptions(vp));
  const page = await ctx.newPage();
  try {
    await page.goto(baseUrl + role.login.portal, { waitUntil: 'networkidle', timeout: cfg.navigationTimeoutMs || 25000 }).catch(() => {});
    await page.locator('input[type=email]').first().fill(creds.email);
    await page.locator('input[type=password]').first().fill(creds.password);
    await page.locator('button[type=submit]').first().click();
    await page.waitForURL((u) => !/login/.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await acceptConsentIfShown(page);
    const token = await page.evaluate(() => localStorage.getItem('rr_access_token')).catch(() => null);
    if (!token) {
      const msg = (await page.innerText('body').catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`login não concluído (ficou em ${new URL(page.url()).pathname}): ${msg}`);
    }
    return await ctx.storageState();
  } finally {
    await ctx.close();
  }
}

async function discoverId(browser, baseUrl, storageState, discover, vp) {
  const ctx = await browser.newContext(contextOptions(vp, storageState));
  const page = await ctx.newPage();
  try {
    await page.goto(baseUrl + '/offline', { waitUntil: 'domcontentloaded' }).catch(() => {});
    const json = await page.evaluate(async (api) => {
      const h = {};
      const t = localStorage.getItem('rr_access_token');
      if (t) h.Authorization = 'Bearer ' + t;
      const r = await fetch(api, { headers: h });
      return r.ok ? r.json() : null;
    }, discover.api);
    const v = json ? [].concat(discover.pick).map((p) => pickPath(json, p)).find((x) => x != null) : undefined;
    return v == null ? null : String(v);
  } finally {
    await ctx.close();
  }
}

async function capturePage(browser, { baseUrl, storageState, route, vp, cfg }) {
  const ctx = await browser.newContext(contextOptions(vp, storageState));
  const page = await ctx.newPage();
  const failedRequests = [];
  const pending = [];
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e.message || e).slice(0, 200)));
  page.on('response', (res) => {
    const u = res.url();
    if (!u.includes('/api/') || res.status() < 400) return;
    pending.push((async () => {
      let message = '';
      try {
        const body = await res.text();
        try { const j = JSON.parse(body); message = Array.isArray(j.message) ? j.message.join('; ') : (j.message || j.error || ''); }
        catch { message = body.slice(0, 120); }
      } catch {}
      let path = u;
      try { const p = new URL(u); path = p.pathname; } catch {}
      failedRequests.push({ status: res.status(), method: res.request().method(), path, message: String(message).slice(0, 200) });
    })());
  });
  try {
    try {
      await page.goto(baseUrl + route, { waitUntil: 'networkidle', timeout: cfg.navigationTimeoutMs || 25000 });
    } catch (e) {
      if (!/Timeout/i.test(e.message)) throw e; // networkidle pode não acontecer (polling); segue com o que carregou
    }
    await page.waitForTimeout(cfg.settleMs ?? 1500);
    await Promise.allSettled(pending);
    const dom = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const txt = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
      const all = (sel) => [...document.querySelectorAll(sel)].filter(vis);
      const labelFor = (el) => {
        if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return txt(l); }
        const wrap = el.closest('label'); if (wrap) return txt(wrap);
        return el.getAttribute('aria-label') || '';
      };
      return {
        title: document.title,
        headings: all('h1,h2,h3').map(txt).filter(Boolean),
        buttons: all('button,[role=button],input[type=submit],input[type=button]').map((b) => txt(b) || b.value || '').filter(Boolean),
        links: all('a[href]').map(txt).filter(Boolean),
        fields: all('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea').map((f) => ({
          type: f.tagName === 'INPUT' ? (f.type || 'text') : f.tagName.toLowerCase(),
          label: labelFor(f).slice(0, 120),
          placeholder: (f.getAttribute('placeholder') || '').slice(0, 120),
          required: !!f.required,
        })),
        // role=alert sempre conta; demais candidatos (toasts, classes de erro/vermelho) só se o texto soar como erro,
        // porque a marca usa vermelho em títulos e selos comuns.
        errors: [
          ...all('[role=alert],[aria-live=assertive]').map(txt),
          ...all('[role=status],[aria-live=polite],[data-sonner-toast],.toast,[class*="toast"],[class*="error"],[class*="destructive"],[class*="text-red"],[class*="bg-red"]')
            .map(txt)
            .filter((s) => /erro|error|falh|fail|inválid|invalid|não foi possível|nao foi possivel|obrigatóri|tente novamente|expirad|negad|incorret|sem permissão|não encontrad|indisponível|unexpected|undefined/i.test(s)),
        ].filter((s) => s && s.length < 400),
        visibleText: document.body ? document.body.innerText : '',
      };
    });
    const finalPath = (() => { try { const u = new URL(page.url()); return u.pathname + u.search; } catch { return page.url(); } })();
    const routePath = route.split('?')[0];
    const redirectedToLogin = !/login/.test(routePath) && /(^|\/)(athlete-)?login/.test(finalPath.split('?')[0]);
    if (jsErrors.length) dom.errors = [...dom.errors, ...jsErrors.map((m) => `[erro JS no navegador] ${m}`)];
    return { ...dom, failedRequests, finalPath, redirectedToLogin };
  } finally {
    await ctx.close();
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

function avg(xs) { return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0; }

const HELP = `Uso: node scripts/qa/jev-ux-audit.mjs [--dry-run] [--max-pages N] [--concurrency N]
       [--roles public,athlete,coach,owner] [--viewports mobile-390,desktop-1366]
       [--base-url http://localhost] [--config arquivo.json] [--out pasta]`;

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { console.log(HELP); return 0; }
  loadDotEnv(join(REPO_ROOT, '.env.qa'));
  loadDotEnv();
  const cfg = JSON.parse(await readFile(opts.config, 'utf8'));
  const baseUrl = (opts.baseUrl || process.env.QA_BASE_URL || cfg.baseUrl || 'http://localhost').replace(/\/+$/, '');
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!opts.dryRun && !apiKey) {
    console.error('✗ TYPESAFE_API_KEY não definido. Coloque no .env da raiz ou rode com --dry-run. Veja docs/QA-JEV.md');
    return 2;
  }
  await mkdir(opts.out, { recursive: true });

  const roleNames = (opts.roles || Object.keys(cfg.roles)).filter((r) => cfg.roles[r]);
  const viewports = (cfg.viewports || []).filter((v) => !opts.viewports || opts.viewports.includes(v.name));
  if (!viewports.length) { console.error('✗ Nenhum viewport selecionado.'); return 2; }

  const { chromium } = await loadPlaywright();
  const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath, headless: true });

  const results = [];
  const secrets = [];
  const tasks = [];
  try {
    // 1) Login por papel + descoberta de rotas dinâmicas
    for (const roleName of roleNames) {
      const role = cfg.roles[roleName];
      const label = role.label || roleName;
      let storageState = null;
      const creds = credentialsFor(role);
      if (creds?.missing) {
        console.warn(`! ${label}: pulando — defina ${creds.missing.join(' e ')}`);
        results.push({ role: roleName, roleLabel: label, route: '(todas)', viewport: null, error: `credenciais ausentes: ${creds.missing.join(', ')}` });
        continue;
      }
      if (creds) {
        secrets.push(creds.password, creds.email);
        try {
          storageState = await login(browser, baseUrl, role, creds, viewports[viewports.length - 1], cfg);
          console.log(`✓ login ${label}`);
        } catch (e) {
          console.warn(`✗ login ${label}: ${e.message}`);
          results.push({ role: roleName, roleLabel: label, route: role.login.portal, viewport: null, error: `login falhou: ${e.message}` });
          continue;
        }
        for (const o of storageState.origins || []) for (const it of o.localStorage || []) if (/token/i.test(it.name) && it.value) secrets.push(it.value);
      }
      for (const r of resolveRoutes(cfg, roleName)) {
        let route = r.path;
        if (r.discover) {
          const id = await discoverId(browser, baseUrl, storageState, r.discover, viewports[0]).catch(() => null);
          if (!id) {
            results.push({ role: roleName, roleLabel: label, route: r.path, viewport: null, error: `não achei um id em ${r.discover.api} (${r.discover.pick})` });
            continue;
          }
          route = r.path.replace(/\{[^}]+\}/, encodeURIComponent(id));
        }
        for (const vp of viewports) tasks.push({ roleName, role, label, storageState, route, vp });
      }
    }
    const selected = tasks.slice(0, opts.maxPages);
    if (selected.length < tasks.length) console.log(`(limitado a ${selected.length} de ${tasks.length} capturas por --max-pages)`);

    // 2) Captura
    const captured = await pool(selected, opts.concurrency, async (t, idx) => {
      try {
        const raw = await capturePage(browser, { baseUrl, storageState: t.storageState, route: t.route, vp: t.vp, cfg });
        const state = buildState({ ...raw, role: t.roleName, audience: t.role.audience, route: t.route, viewport: `${t.vp.width}x${t.vp.height} (${t.vp.name})` },
          { maxTextChars: cfg.maxTextChars, maxListItems: cfg.maxListItems, secrets });
        console.log(`  [${idx + 1}/${selected.length}] capturado ${t.label} ${t.route} @${t.vp.name}${raw.redirectedToLogin ? ' → LOGIN' : ''}${raw.failedRequests.length ? ` (${raw.failedRequests.length} req. falhas)` : ''}`);
        return { t, raw, state };
      } catch (e) {
        console.warn(`  [${idx + 1}/${selected.length}] ✗ ${t.route} @${t.vp.name}: ${e.message}`);
        return { t, error: `captura falhou: ${e.message.slice(0, 200)}` };
      }
    });

    const questions = buildQuestions();
    const model = cfg.model || DEFAULT_MODEL;

    if (opts.dryRun) {
      const lines = [];
      const sizes = [];
      for (const c of captured) {
        if (c.error) continue;
        const body = buildRequestBody(c.state, { model, questions });
        const json = JSON.stringify(body);
        const stateBytes = Buffer.byteLength(JSON.stringify(c.state));
        sizes.push({ total: Buffer.byteLength(json), state: stateBytes, text: c.state.visibleText.length });
        lines.push(JSON.stringify({ id: `${c.t.roleName}:${c.t.route}@${c.t.vp.name}`, bytes: Buffer.byteLength(json), stateBytes, body }));
      }
      await writeFile(join(opts.out, 'requests.jsonl'), lines.join('\n') + (lines.length ? '\n' : ''));
      const fails = captured.filter((c) => c.error).length + results.filter((r) => r.error).length;
      const summary = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        requests: lines.length,
        failures: fails,
        avgRequestBytes: avg(sizes.map((s) => s.total)),
        avgStateBytes: avg(sizes.map((s) => s.state)),
        maxStateBytes: sizes.length ? Math.max(...sizes.map((s) => s.state)) : 0,
        avgVisibleTextChars: avg(sizes.map((s) => s.text)),
        roughTokenEstimatePerRequest: avg(sizes.map((s) => s.total)) ? Math.round(avg(sizes.map((s) => s.total)) / 4) : 0,
        roughTokenEstimateNote: 'estimativa grosseira = bytes/4; os tokens reais só aparecem em usage na execução real',
        failuresDetail: [...results.filter((r) => r.error), ...captured.filter((c) => c.error).map((c) => ({ role: c.t.roleName, route: c.t.route, viewport: c.t.vp.name, error: c.error }))],
      };
      await writeFile(join(opts.out, 'dry-run-summary.json'), JSON.stringify(summary, null, 2));
      console.log(`\nDry run: ${lines.length} requisições gravadas em ${join(opts.out, 'requests.jsonl')} (nenhuma chamada ao Jev).`);
      console.log(`Tamanho médio do state: ${summary.avgStateBytes} bytes · requisição média: ${summary.avgRequestBytes} bytes · falhas: ${fails}`);
      return 0;
    }

    // 3) Jev — uma requisição por página × viewport, perguntas independentes em paralelo
    const answered = await pool(captured, opts.concurrency, async (c, idx) => {
      const base = { role: c.t.roleName, roleLabel: c.t.label, route: c.t.route, viewport: c.t.vp.name };
      if (c.error) return { ...base, error: c.error };
      try {
        const { response, attempts } = await callJev(buildRequestBody(c.state, { model, questions }), {
          apiKey, apiUrl: cfg.apiUrl || DEFAULT_API_URL,
          onRetry: ({ attempt, status, wait }) => console.warn(`  ↻ ${c.t.route} @${c.t.vp.name}: HTTP ${status}, tentativa ${attempt} em ${wait}ms`),
        });
        const evaluation = evaluateAnswers(response.answers, c.raw, cfg.thresholds, cfg.severityWeights);
        console.log(`  [${idx + 1}/${captured.length}] Jev ${c.t.route} @${c.t.vp.name}: ${evaluation.flags.length ? evaluation.flags.map((f) => f.label).join(', ') : 'ok'}`);
        return { ...base, finalPath: c.raw.finalPath, attempts, state: c.state, response, evaluation };
      } catch (e) {
        console.warn(`  ✗ Jev ${c.t.route} @${c.t.vp.name}: ${e.message}`);
        return { ...base, finalPath: c.raw.finalPath, state: c.state, error: e.message };
      }
    });
    results.push(...answered);
  } finally {
    await browser.close().catch(() => {});
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    model: cfg.model || DEFAULT_MODEL,
    modelsSeen: [...new Set(results.map((r) => r.response?.model).filter(Boolean))],
    baseUrl,
  };
  const json = { ...meta, thresholds: { ...DEFAULT_THRESHOLDS, ...cfg.thresholds }, questions: buildQuestions(), usage: sumUsage(results), results };
  await writeFile(join(opts.out, 'jev-report.json'), JSON.stringify(json, null, 2));
  await writeFile(join(opts.out, 'jev-report.md'), renderMarkdown(results, meta));
  const u = json.usage;
  console.log(`\nRelatório: ${join(opts.out, 'jev-report.md')}`);
  console.log(`Tokens: entrada ${u.input_tokens}, saída ${u.output_tokens} em ${u.requests} requisições.`);
  return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main().then((code) => process.exit(code ?? 0), (err) => { console.error('✗', err.stack || err.message); process.exit(1); });
}
