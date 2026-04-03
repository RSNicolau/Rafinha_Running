// Utility to set/get a non-sensitive auth signal cookie for middleware
// The actual JWT stays in localStorage; this cookie just signals "logged in" for server-side redirects

export function setAuthCookie(token: string) {
  if (typeof document === 'undefined') return;
  // Store just a "logged in" signal (not the token itself) for middleware
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `rr_auth=1; expires=${expires}; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'rr_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
