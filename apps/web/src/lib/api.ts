import axios from 'axios';
import { clearAuthCookie } from './auth-cookie';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Garantir prefixo /v1/ em todas as chamadas (fallback para compatibilidade)
api.interceptors.request.use((config) => {
  if (config.url && !config.url.startsWith('/v1/') && !config.url.startsWith('http')) {
    config.url = '/v1' + (config.url.startsWith('/') ? config.url : '/' + config.url);
  }
  return config;
});

// Attach token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rr_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Endpoints de autenticação: um 401 aqui significa "credenciais/código inválidos",
 * NÃO "sessão expirada". Não tentar refresh nem redirecionar — a página exibe o erro.
 */
const AUTH_ENDPOINT_RE =
  /\/auth\/(login|register|refresh|logout|logout-all|forgot-password|reset-password|google|apple|2fa\/[^/?]+)(\/|\?|$)/;

export function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return AUTH_ENDPOINT_RE.test(url);
}

/** Portal de login correto para o usuário atual (atleta → /athlete-login). */
export function loginPathForCurrentUser(): string {
  if (typeof window === 'undefined') return '/login';
  try {
    const raw = localStorage.getItem('rr_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.role === 'ATHLETE') return '/athlete-login';
      if (u?.role) return '/login';
    }
  } catch {}
  return window.location.pathname.startsWith('/athlete') ? '/athlete-login' : '/login';
}

function clearLocalSession() {
  localStorage.removeItem('rr_access_token');
  localStorage.removeItem('rr_refresh_token');
  localStorage.removeItem('rr_user');
  localStorage.removeItem('rr_team_id');
  clearAuthCookie();
}

// Handle 401 → try refresh token, then redirect to login
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== 'undefined' &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      const refreshToken = localStorage.getItem('rr_refresh_token');

      if (refreshToken && !isRefreshing) {
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
          const newToken = data.accessToken;

          localStorage.setItem('rr_access_token', newToken);
          if (data.refreshToken) {
            localStorage.setItem('rr_refresh_token', data.refreshToken);
          }

          // Retry all queued requests with new token
          refreshQueue.forEach((cb) => cb(newToken));
          refreshQueue = [];
          isRefreshing = false;

          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed → logout
          isRefreshing = false;
          refreshQueue.forEach((cb) => cb(null));
          refreshQueue = [];
          const target = loginPathForCurrentUser();
          clearLocalSession();
          window.location.href = target;
        }
      } else if (refreshToken && isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            if (!token) return reject(error);
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      } else {
        // No refresh token → immediate logout
        const target = loginPathForCurrentUser();
        clearLocalSession();
        window.location.href = target;
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Converte qualquer erro (axios, rede, JS) numa mensagem em português para o usuário.
 * Usa a mensagem da API quando houver (já em PT); nunca expõe textos técnicos em inglês.
 */
export function friendlyError(e: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  const err = e as any;
  if (!err) return fallback;

  if (axios.isAxiosError(err) || err?.isAxiosError) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'A requisição demorou demais. Verifique sua conexão e tente novamente.';
    }
    if (!err.response) {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.';
    }
    const status: number = err.response.status;
    const data = err.response.data;
    let msg: unknown = data?.message ?? data?.error;
    if (Array.isArray(msg)) msg = msg.filter((m) => typeof m === 'string').join(' ');
    if (typeof msg === 'string' && msg.trim() && !looksTechnical(msg)) return msg.trim();

    if (status === 400) return 'Dados inválidos. Revise os campos e tente novamente.';
    if (status === 401) return 'Sessão expirada ou credenciais inválidas.';
    if (status === 403) return 'Você não tem permissão para esta ação.';
    if (status === 404) return 'Não encontrado.';
    if (status === 409) return 'Este registro já existe.';
    if (status === 413) return 'Arquivo muito grande.';
    if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (status >= 500) return 'O servidor encontrou um problema. Tente novamente em instantes.';
    return fallback;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Você está sem conexão com a internet.';
  }
  return fallback;
}

/** Heurística: mensagens padrão em inglês de frameworks/JS não devem chegar ao usuário. */
function looksTechnical(msg: string): boolean {
  return /^(Internal server error|Unauthorized|Forbidden|Not Found|Bad Request|Conflict|Too Many Requests|ThrottlerException|Network Error|timeout of|Request failed with status code|Unexpected token|Cannot read propert|.*is not (a function|defined|valid JSON))/i.test(
    msg.trim(),
  );
}
