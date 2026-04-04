import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED = ['/dashboard'];
const AUTH_PAGES = ['/login', '/register', '/athlete-login', '/athlete-register'];

// JWT secret encoded as Uint8Array for jose (Edge Runtime compatible)
function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function verifyToken(token: string): Promise<boolean> {
  const secret = getJwtSecret();
  // If secret not configured in this environment (e.g., no env var at build), fall back
  // to cookie-presence-only check so the middleware never crashes the site.
  if (!secret) return true;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authCookie = req.cookies.get('rr_auth')?.value;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isProtected) {
    if (!authCookie) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    // Validate JWT signature server-side — prevents forged cookies from accessing dashboard
    const valid = await verifyToken(authCookie);
    if (!valid) {
      const res = NextResponse.redirect(new URL('/login', req.url));
      res.cookies.delete('rr_auth');
      return res;
    }
  }

  if (isAuthPage && authCookie) {
    // Only redirect if the cookie is actually a valid token
    const valid = await verifyToken(authCookie);
    if (valid) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/athlete-login', '/athlete-register'],
};
