import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "access_token";
const ADMIN_AUTH_COOKIE = "admin_token";

/**
 * Optimistic redirect to the right login page when there is no session cookie at all.
 * /admin/* is the Super Admin portal (admin cookie); everything else is the tenant workspace.
 * The real checks happen in the API's AdminJwtGuard / JwtAuthGuard, reached through requireAdmin() / requireUser().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login" || request.cookies.has(ADMIN_AUTH_COOKIE)) return NextResponse.next();
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (!request.cookies.has(AUTH_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Every page except /login, the API, Next.js internals and static files (anything with a dot).
  matcher: ["/((?!login|api|_next|.*\\..*).*)"],
};
