import { NextResponse, type NextRequest } from "next/server";
import { clientApiRouteAllowed, clientAuthEnforced, clientRouteAllowed } from "@/lib/clientRuntimePolicy";

export function middleware(request: NextRequest) {
  if (!clientAuthEnforced()) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/healthz" ||
    pathname === "/login" ||
    pathname.startsWith("/api/client-auth/")
  ) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return clientApiRouteAllowed(pathname)
      ? NextResponse.next()
      : NextResponse.json({ ok: false, error: "client_route_not_enabled" }, { status: 403 });
  }

  if (!clientRouteAllowed(pathname)) {
    const target = new URL("/client-unavailable", request.url);
    target.searchParams.set("route", pathname);
    return NextResponse.redirect(target);
  }

  if (!request.cookies.get("veloce_access_token")?.value) {
    const target = new URL("/login", request.url);
    target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
