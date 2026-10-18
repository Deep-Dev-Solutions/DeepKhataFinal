import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Better Auth session cookie: prefixed with __Secure- when served over https.
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/cash",
  "/customers",
  "/inventory",
  "/orders",
  "/products",
  "/reports",
  "/settings",
  "/vendors",
];

/**
 * Optimistic check only: the cookie must exist. The API is the authority (it
 * validates, revokes and rate-limits the session), and role based screens
 * (STAFF cannot open reports/settings) are enforced by the API and the UI.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/dashboard") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/cash/:path*",
    "/customers/:path*",
    "/inventory/:path*",
    "/orders/:path*",
    "/products/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/vendors/:path*",
  ],
};
