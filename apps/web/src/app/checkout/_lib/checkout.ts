/** Helpers do checkout público (loja, eventos, planos). */

export const API_BASE = '/api/v1';

export type CheckoutMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
export type PaymentChoice = 'PIX' | 'ASAAS_INVOICE' | 'INTERNATIONAL_CARD';

export interface CheckoutBuyer {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
}

export interface CheckoutResult {
  paymentId: string;
  accessToken: string;
  provider: 'ASAAS' | 'STRIPE' | 'FAKE' | string;
  method: CheckoutMethod;
  amountInCents: number;
  status: string;
  checkoutUrl: string | null;
  pix: { qrCodeBase64: string | null; copyPaste: string; expiresAt: string | null } | null;
  expiresAt: string | null;
}

export interface CheckoutMethods {
  provider: string | null;
  pix: boolean;
  boletoOrCard: boolean;
  internationalCard: boolean;
  fake: boolean;
}

export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const t = localStorage.getItem('rr_access_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

export function isLoggedIn(): boolean {
  return !!authHeaders().Authorization;
}

let refreshing: Promise<boolean> | null = null;

/** Renova o access token (15 min) com o refresh token — mesma regra do axios em src/lib/api.ts. */
async function tryRefresh(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const rt = localStorage.getItem('rr_refresh_token');
        if (!rt) return false;
        const r = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!r.ok) return false;
        const d = await r.json();
        if (!d?.accessToken) return false;
        localStorage.setItem('rr_access_token', d.accessToken);
        if (d.refreshToken) localStorage.setItem('rr_refresh_token', d.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
  let res = await doFetch();
  if (res.status === 401 && isLoggedIn() && (await tryRefresh())) res = await doFetch();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(' · ') : data?.message;
    const err = new Error(msg || `Erro ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function fmtBRL(cents: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents ?? 0) / 100);
}

export function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '');
}

export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** Validação local (o servidor valida de novo). */
export function isValidCpf(v: string): boolean {
  const cpf = onlyDigits(v);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function validateBuyer(b: CheckoutBuyer): string | null {
  if (!b.name || b.name.trim().length < 3) return 'Informe seu nome completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) return 'Informe um e-mail válido.';
  if (!isValidCpf(b.cpf)) return 'CPF inválido.';
  return null;
}

export function choiceToRequest(choice: PaymentChoice): { provider?: 'ASAAS' | 'STRIPE'; method?: CheckoutMethod } {
  if (choice === 'INTERNATIONAL_CARD') return { provider: 'STRIPE' };
  if (choice === 'ASAAS_INVOICE') return { method: 'UNDEFINED' };
  return { method: 'PIX' };
}

const TOKENS_KEY = 'rr_payment_tokens';

/** Guarda o token do pagamento no aparelho para retomar a tela de pagamento. */
export function rememberPaymentToken(paymentId: string, token: string) {
  try {
    const map = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
    map[paymentId] = token;
    const entries = Object.entries(map).slice(-20);
    localStorage.setItem(TOKENS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* armazenamento indisponível */
  }
}

export function recallPaymentToken(paymentId: string): string | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}')[paymentId] ?? null;
  } catch {
    return null;
  }
}

export function paymentUrl(r: { paymentId: string; accessToken: string }) {
  return `/pedido/${r.paymentId}?token=${encodeURIComponent(r.accessToken)}`;
}

export async function createCheckout(body: {
  purpose: 'STORE_ORDER' | 'EVENT_REGISTRATION' | 'PLATFORM_PLAN';
  refId: string;
  refToken?: string;
  buyer: CheckoutBuyer;
  choice: PaymentChoice;
}): Promise<CheckoutResult> {
  const { choice, buyer, ...rest } = body;
  const r = await apiFetch<CheckoutResult>('/checkout', {
    method: 'POST',
    body: JSON.stringify({
      ...rest,
      buyer: { name: buyer.name.trim(), email: buyer.email.trim(), cpf: onlyDigits(buyer.cpf), ...(buyer.phone ? { phone: onlyDigits(buyer.phone) } : {}) },
      ...choiceToRequest(choice),
    }),
  });
  rememberPaymentToken(r.paymentId, r.accessToken);
  return r;
}

export async function loadCheckoutMethods(): Promise<CheckoutMethods> {
  try {
    return await apiFetch<CheckoutMethods>('/checkout/methods');
  } catch {
    return { provider: null, pix: false, boletoOrCard: false, internationalCard: false, fake: false };
  }
}
