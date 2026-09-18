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

  // 2. Agency login page handling
  if (pathname === "/agency-admin/login") {
    if (hasValidToken && role === "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/agency-admin", request.url));
    }
    if (hasValidToken && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // 3. Merchant login page: redirect already authenticated users to /dashboard
  if (hasValidToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 4. Agency protected routes
  const isAgencyRoute =
    pathname === "/agency-admin" || pathname.startsWith("/agency-admin/");
  if (isAgencyRoute) {
    if (!hasValidToken) {
      return NextResponse.redirect(new URL("/agency-admin/login", request.url));
    }
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // 5. Merchant shop protected routes (Accessible to ALL authenticated roles, including SUPER_ADMIN)
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
    // 5a. Block STAFF from reports and settings routes
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
    "/agency-admin/:path*",
  ],
};
