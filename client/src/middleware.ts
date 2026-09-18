import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isTokenValid(token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Base64url to base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);

    if (!payload || typeof payload !== "object") return false;

    // Check expiration if present
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
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

const AUTH_PAGES = ["/", "/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Extract token from cookie or authorization header
  const cookieToken = request.cookies.get("accessToken")?.value;
  let headerToken = request.headers.get("authorization");
  if (headerToken && headerToken.startsWith("Bearer ")) {
    headerToken = headerToken.slice(7).trim();
  }

  const token = cookieToken || headerToken;
  const hasValidToken = isTokenValid(token);

  // 2. If authenticated and hitting '/' or '/login', redirect to '/dashboard'
  if (hasValidToken && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 3. If unauthenticated and hitting a protected route, redirect to '/login'
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!hasValidToken && isProtected) {
    const loginUrl = new URL("/login", request.url);
    // Optionally preserve redirect path:
    if (pathname !== "/dashboard") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
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
