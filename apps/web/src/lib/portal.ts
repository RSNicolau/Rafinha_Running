/**
 * "Portal" de login do usuário (atleta → /athlete-login; treinador/equipe → /login).
 * Usado por páginas públicas (esqueci a senha, redefinir senha, convite) que não sabem o papel
 * do usuário: aceitam `?portal=athlete|coach` e lembram a escolha no navegador.
 */
export type Portal = 'athlete' | 'coach';

const KEY = 'rr_portal_hint';

export function parsePortal(value: string | null | undefined): Portal | null {
  if (value === 'athlete' || value === 'atleta') return 'athlete';
  if (value === 'coach' || value === 'treinador') return 'coach';
  return null;
}

/** Portal pela URL (?portal=) ou pelo último usado neste navegador. */
export function readPortalHint(): Portal | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = parsePortal(new URLSearchParams(window.location.search).get('portal'));
    if (fromUrl) return fromUrl;
  } catch {}
  try {
    const stored = parsePortal(localStorage.getItem(KEY));
    if (stored) return stored;
    const role = JSON.parse(localStorage.getItem('rr_user') || 'null')?.role;
    if (role === 'ATHLETE') return 'athlete';
    if (role) return 'coach';
  } catch {}
  return null;
}

/** Portal só pela URL (?portal=), sem consultar o navegador. */
export function portalFromUrl(): Portal | null {
  if (typeof window === 'undefined') return null;
  try {
    return parsePortal(new URLSearchParams(window.location.search).get('portal'));
  } catch {
    return null;
  }
}

/** Lembra (ou esquece, com null) o portal neste navegador. */
export function rememberPortal(portal: Portal | null) {
  try {
    if (portal) localStorage.setItem(KEY, portal);
    else localStorage.removeItem(KEY);
  } catch {}
}

export function loginPathFor(portal: Portal | null): string {
  return portal === 'athlete' ? '/athlete-login' : '/login';
}
