import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: every route needs a session cookie unless it is listed here
// (the cookie may be split into .0, .1 … chunks).
// The real check (valid session, still on the Roster) is requireViewer() in each page.
const PUBLIC_PATHS = ["/login", "/no-access", "/integritet", "/api/auth", "/status"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies
    .getAll()
    .some(({ name }) => name.includes("authjs.session-token"));
  if (!hasSession) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
