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
    // Expired token check
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

  // Retrieve token from cookies (checking common key names) or Authorization header
  const cookieToken =
    request.cookies.get("accessToken")?.value ||
    request.cookies.get("jwt")?.value;

  let headerToken = request.headers.get("authorization");
  if (headerToken && headerToken.startsWith("Bearer ")) {
    headerToken = headerToken.slice(7).trim();
  }

  const token = cookieToken || headerToken;
  const payload = decodeToken(token);
  const hasValidSession = Boolean(payload && payload.role === "SUPER_ADMIN");

  // If visiting /login with an already valid Super Admin session -> redirect to dashboard
  if (pathname === "/login") {
    if (hasValidSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Strict route guard: redirect unauthenticated or invalid session users to /login
  if (!hasValidSession) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);

    // If an invalid or expired token exists in cookies, wipe it
    if (cookieToken) {
      response.cookies.delete("accessToken");
      response.cookies.delete("jwt");
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /api routes
     * 2. /_next (Next.js internals, static files, images)
     * 3. Static files: favicon.ico, images, fonts
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};