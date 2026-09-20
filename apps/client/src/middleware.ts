import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeToken(token: string | undefined | null): any | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);

    if (!payload || typeof payload !== "object") return null;

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Extract token from cookie or authorization header
  const cookieToken = request.cookies.get("accessToken")?.value;
  let headerToken = request.headers.get("authorization");
  if (headerToken && headerToken.startsWith("Bearer ")) {
    headerToken = headerToken.slice(7).trim();
  }

  const token = cookieToken || headerToken;
  const payload = decodeToken(token);
  const hasValidToken = !!payload;
  const role = payload?.role;

  // 1. Merchant login page: redirect already authenticated users to /dashboard
  if (hasValidToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Merchant shop protected routes (Accessible to ALL authenticated roles, including SUPER_ADMIN)
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected) {
    if (!hasValidToken) {
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/dashboard") {
        loginUrl.searchParams.set("from", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    // 2a. Block STAFF from reports and settings routes
    if (role === "STAFF") {
      const isStaffRestricted =
        pathname === "/reports" ||
        pathname.startsWith("/reports/") ||
        pathname === "/settings" ||
        pathname.startsWith("/settings/");

      if (isStaffRestricted) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    // Authenticated users (whether OWNER, STAFF, or SUPER_ADMIN) proceed directly to the requested merchant route.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
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
