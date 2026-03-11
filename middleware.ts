import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge Middleware — Server-side auth gate.
 *
 * Reads the `auth-token` httpOnly cookie and verifies the JWT at the edge.
 * Unauthenticated requests to protected routes are redirected to /login
 * BEFORE any React code runs — eliminating the "sign-in flash" entirely.
 *
 * NOTE: We use `jose` (edge-compatible) instead of `jsonwebtoken` (Node-only).
 */

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "urbassist-secret-key-change-in-production"
);

/** Routes that do NOT require authentication */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",     // all auth endpoints
  "/_next",        // Next.js internals
  "/favicon.ico",
  "/fonts",
  "/images",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through without auth check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow all API routes that aren't explicitly protected
  // (they handle their own auth via getSession())
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Read the auth cookie
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    // No token → redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Verify JWT at the edge (fast, no DB call)
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    // Token expired or invalid → clear cookie and redirect
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("auth-token");
    return response;
  }
}

export const config = {
  // Run middleware on all routes except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|fonts|images).*)",
  ],
};
