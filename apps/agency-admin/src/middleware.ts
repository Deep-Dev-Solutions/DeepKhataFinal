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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookieToken = request.cookies.get("accessToken")?.value;
  let headerToken = request.headers.get("authorization");
  if (headerToken && headerToken.startsWith("Bearer ")) {
    headerToken = headerToken.slice(7).trim();
  }

  const token = cookieToken || headerToken;
  const payload = decodeToken(token);
  const isSuperAdmin = payload?.role === "SUPER_ADMIN";

  // Authenticated super admins hitting the login page → straight to console
  if (pathname === "/login") {
    if (isSuperAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Everything else is protected and requires a SUPER_ADMIN session
  if (!payload || !isSuperAdmin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/tenants/:path*"],
};