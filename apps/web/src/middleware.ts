import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = ['/dashboard'];
const AUTH_PAGES = ['/login', '/register', '/athlete-login', '/athlete-register'];

// The cookie rr_auth is a presence-only signal set by the client after login.
// Real JWT validation happens server-side on the API — middleware just handles routing.
function hasAuthCookie(req: NextRequest): boolean {
  return !!req.cookies.get('rr_auth')?.value;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isProtected && !hasAuthCookie(req)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isAuthPage && hasAuthCookie(req)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/athlete-login', '/athlete-register'],
};
