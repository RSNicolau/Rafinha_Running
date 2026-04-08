// Utility to set/get a non-sensitive auth signal cookie for middleware.
// The actual JWT stays in localStorage; this cookie just signals "logged in" for server-side routing.
// Value is "1" — real security is enforced by the API on every request.

export function setAuthCookie(_token: string) {
  if (typeof document === 'undefined') return;
  // Cookie lasts 7 days (refresh token lifetime). Presence = user is considered logged in by middleware.
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `rr_auth=1; expires=${expires}; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'rr_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
