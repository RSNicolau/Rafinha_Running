// Utility to set/get a non-sensitive auth signal cookie for middleware.
// The actual JWT stays in localStorage; this cookie only drives server-side ROUTING (which portal to show).
// Value = papel do usuário (ex.: "ATHLETE") ou "1" (legado). Não é controle de acesso:
// a API valida o JWT e o papel em toda requisição.

const ROLE_RE = /^[A-Z_]{2,32}$/;

export function setAuthCookie(role?: string | null) {
  if (typeof document === 'undefined') return;
  const value = role && ROLE_RE.test(role) ? role : '1';
  // Cookie lasts 7 days (refresh token lifetime). Presence = user is considered logged in by middleware.
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `rr_auth=${value}; expires=${expires}; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'rr_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
