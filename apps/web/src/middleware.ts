import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/super-admin'];
const AUTH_PAGES = ['/login', '/register', '/athlete-login', '/athlete-register'];
const ATHLETE_AUTH_PAGES = ['/athlete-login', '/athlete-register'];

/**
 * Rotas do /dashboard que o ATLETA pode abrir. As demais são do treinador/gestão: o atleta é
 * levado para /athlete em vez de ver telas de coach com erro (os dados já são bloqueados na API).
 */
const ATHLETE_DASHBOARD_ALLOWED = [
  '/dashboard/athlete',
  '/dashboard/chat',
  '/dashboard/integrations',
  '/dashboard/settings',
];

// Headers internos entre o Next (proxy) e a API — nunca aceitos vindos do navegador
const CLIENT_IP_HEADER = 'x-rr-client-ip';
const PROXY_SECRET_HEADER = 'x-rr-proxy-secret';

// The cookie rr_auth is a routing-only signal set by the client after login (value = role, or "1" legacy).
// Real JWT validation happens server-side on the API — middleware just handles routing.
function authCookie(req: NextRequest): string | null {
  return req.cookies.get('rr_auth')?.value || null;
}

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Rota de coach no /dashboard que o atleta não deve abrir? ("/dashboard" exato fica liberado.) */
function isCoachOnlyDashboardPath(pathname: string): boolean {
  if (pathname === '/super-admin' || pathname.startsWith('/super-admin/')) return true;
  if (!pathname.startsWith('/dashboard/')) return false;
  return !matches(pathname, ATHLETE_DASHBOARD_ALLOWED);
}

/**
 * IP do cliente como visto pela plataforma/proxy à frente do Next.
 * req.ip é preenchido pela plataforma (ex.: Vercel); senão usa o primeiro X-Forwarded-For,
 * que neste ponto foi definido pelo proxy reverso de borda (Caddy/Nginx sobrescreve o header).
 */
function resolveClientIp(req: NextRequest): string | undefined {
  const platformIp = (req as NextRequest & { ip?: string }).ip;
  if (platformIp) return platformIp;
  const xff = req.headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip')?.trim() || undefined;
}

function forwardApiRequest(req: NextRequest) {
  const headers = new Headers(req.headers);
  // Remove qualquer valor forjado pelo navegador
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_SECRET_HEADER);

  const ip = resolveClientIp(req);
  if (ip) headers.set(CLIENT_IP_HEADER, ip.slice(0, 64));
  // A API só confia em x-rr-client-ip quando acompanhado do segredo compartilhado
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret) headers.set(PROXY_SECRET_HEADER, secret);

  return NextResponse.next({ request: { headers } });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    return forwardApiRequest(req);
  }

  const isProtected = matches(pathname, PROTECTED);
  const isAuthPage = matches(pathname, AUTH_PAGES);
  const cookie = authCookie(req);
  const isAthlete = cookie === 'ATHLETE';

  if (isProtected && !cookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isAuthPage && cookie) {
    // Atleta logado vai para a área do atleta; os demais para o painel
    const legacyAthletePortal = cookie === '1' && matches(pathname, ATHLETE_AUTH_PAGES);
    return NextResponse.redirect(new URL(isAthlete || legacyAthletePortal ? '/athlete' : '/dashboard', req.url));
  }

  if (isAthlete && isCoachOnlyDashboardPath(pathname)) {
    return NextResponse.redirect(new URL('/athlete', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/super-admin/:path*',
    '/login',
    '/register',
    '/athlete-login',
    '/athlete-register',
  ],
};
