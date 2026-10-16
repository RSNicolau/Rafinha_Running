import { create } from 'zustand';
import { api, friendlyError } from '@/lib/api';
import { setAuthCookie, clearAuthCookie } from '../lib/auth-cookie';

export interface UserBranding {
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  tenantName?: string;
  niche?: string;
}

/** Papel do usuário na equipe ativa. ATHLETE = atleta da equipe. */
export type TeamRole = 'OWNER' | 'ADMIN' | 'COACH' | 'STAFF' | 'ATHLETE';

/** Equipe ativa (assessoria) — vem de /auth/login, /auth/register e /users/me. */
export interface ActiveTeam {
  id: string;
  name: string;
  slug: string;
  role: TeamRole;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
  branding?: UserBranding;
  /** true quando o usuário precisa aceitar a versão vigente dos Termos/Política */
  needsConsent?: boolean;
  /** Equipe ativa e o papel do usuário nela (null = sem equipe) */
  team?: ActiveTeam | null;
}

const TEAM_KEY = 'rr_team_id';

/** Envia a equipe ativa em todas as requisições (header x-team-id, validado no servidor). */
function applyTeamHeader(teamId: string | null | undefined) {
  if (teamId) {
    api.defaults.headers.common['x-team-id'] = teamId;
    try { localStorage.setItem(TEAM_KEY, teamId); } catch {}
  } else {
    delete api.defaults.headers.common['x-team-id'];
    try { localStorage.removeItem(TEAM_KEY); } catch {}
  }
}

/** Papéis de equipe com visão da equipe inteira (gestão). */
export function isTeamManager(user: User | null | undefined): boolean {
  const r = user?.team?.role;
  return r === 'OWNER' || r === 'ADMIN';
}

export interface LogoutOptions {
  /** Encerra as sessões de todos os dispositivos */
  allDevices?: boolean;
  /** Destino após sair (padrão: /athlete-login para atleta, /login para os demais) */
  redirectTo?: string;
}

function asLogoutOptions(v: unknown): LogoutOptions {
  if (!v || typeof v !== 'object' || 'nativeEvent' in (v as object) || 'preventDefault' in (v as object)) return {};
  const o = v as LogoutOptions;
  return {
    allDevices: o.allDevices === true,
    redirectTo: typeof o.redirectTo === 'string' && o.redirectTo.startsWith('/') && !o.redirectTo.startsWith('//') ? o.redirectTo : undefined,
  };
}

export type LoginResult = { mfaRequired: false } | { mfaRequired: true; mfaToken: string };

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  /** Retorna { mfaRequired: true, mfaToken } quando a conta tem 2FA — conclua com verifyMfa. */
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  /** Sessão já emitida pelo servidor (ex.: resposta de /auth/register) — login automático. */
  setSession: (data: { accessToken: string; refreshToken?: string; user: User; team?: ActiveTeam | null }) => User;
  /** Revoga o refresh token no servidor, limpa o armazenamento e vai para o login do portal certo. */
  /** Aceita ser usado direto como onClick (o evento é ignorado). */
  logout: (opts?: LogoutOptions | unknown) => Promise<void>;
  loadUser: () => void;
  /** Recarrega a equipe ativa do servidor (GET /teams/me) e atualiza o usuário salvo. */
  refreshTeam: () => Promise<ActiveTeam | null>;
  clearError: () => void;
}

function persistSession(data: { accessToken: string; refreshToken?: string; user: User; team?: ActiveTeam | null }) {
  localStorage.setItem('rr_access_token', data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem('rr_refresh_token', data.refreshToken);
  }
  const user: User = { ...data.user, team: data.user?.team ?? data.team ?? null };
  localStorage.setItem('rr_user', JSON.stringify(user));
  setAuthCookie(user.role);
  // Atleta não envia x-team-id (o servidor usa a equipe do perfil)
  applyTeamHeader(user.team && user.team.role !== 'ATHLETE' ? user.team.id : null);
  return user;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data?.mfaRequired && data?.mfaToken) {
        set({ isLoading: false });
        return { mfaRequired: true, mfaToken: data.mfaToken as string };
      }
      const user = persistSession(data);
      set({ user, isAuthenticated: true, isLoading: false });
      return { mfaRequired: false };
    } catch (err: any) {
      const message = err?.response?.status === 401
        ? (typeof err.response?.data?.message === 'string' ? err.response.data.message : 'E-mail ou senha incorretos')
        : friendlyError(err);
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  verifyMfa: async (mfaToken, code) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/2fa/login', { mfaToken, code });
      const user = persistSession(data);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = friendlyError(err, 'Código inválido');
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  setSession: (data) => {
    const user = persistSession(data);
    set({ user, isAuthenticated: true, isLoading: false, error: null });
    return user;
  },

  logout: async (rawOpts) => {
    const opts = asLogoutOptions(rawOpts);
    let refreshToken: string | null = null;
    let role: string | undefined = get().user?.role;
    try {
      refreshToken = localStorage.getItem('rr_refresh_token');
      if (!role) role = JSON.parse(localStorage.getItem('rr_user') || 'null')?.role;
    } catch {}
    const target = opts.redirectTo ?? (role === 'ATHLETE' ? '/athlete-login' : '/login');

    // Limpa a sessão local primeiro (síncrono): quem chamar router.replace() logo depois
    // já não é devolvido ao painel pelo middleware.
    localStorage.removeItem('rr_access_token');
    localStorage.removeItem('rr_refresh_token');
    localStorage.removeItem('rr_user');
    applyTeamHeader(null);
    clearAuthCookie();
    set({ user: null, isAuthenticated: false, isLoading: false });

    // Revoga a sessão no servidor (best effort, com limite de tempo — sair nunca pode travar)
    if (refreshToken) {
      try {
        await api.post(
          '/auth/logout',
          { refreshToken, ...(opts.allDevices ? { allDevices: true } : {}) },
          { timeout: 5000 },
        );
      } catch {
        // offline/servidor fora: a limpeza local já foi feita
      }
    }

    window.location.href = target;
  },

  loadUser: () => {
    try {
      const stored = localStorage.getItem('rr_user');
      const token = localStorage.getItem('rr_access_token');
      if (stored && token) {
        const user: User = JSON.parse(stored);
        // Mantém o cookie de roteamento com o papel (cookies antigos tinham só "1")
        setAuthCookie(user.role);
        const teamId = localStorage.getItem(TEAM_KEY) || (user.team && user.team.role !== 'ATHLETE' ? user.team.id : null);
        applyTeamHeader(teamId);
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        // No token in localStorage — ensure cookie is also cleared to avoid middleware loop
        clearAuthCookie();
        set({ isLoading: false });
      }
    } catch {
      clearAuthCookie();
      set({ isLoading: false });
    }
  },

  refreshTeam: async () => {
    try {
      const { data } = await api.get('/teams/me').catch((err) => {
        // x-team-id obsoleto (ex.: removido da equipe) → tenta de novo com a equipe padrão
        if (err?.response?.status === 403) {
          applyTeamHeader(null);
          return api.get('/teams/me');
        }
        throw err;
      });
      const t = data?.activeTeam;
      const team: ActiveTeam | null = t
        ? { id: t.id, name: t.name, slug: t.slug, role: t.role, logoUrl: t.logoUrl ?? null, primaryColor: t.primaryColor ?? null }
        : null;
      const current = get().user;
      if (current) {
        const user = { ...current, team };
        try { localStorage.setItem('rr_user', JSON.stringify(user)); } catch {}
        set({ user });
      }
      applyTeamHeader(team && team.role !== 'ATHLETE' ? team.id : null);
      return team;
    } catch {
      return get().user?.team ?? null;
    }
  },

  clearError: () => set({ error: null }),
}));
