import { NextResponse, type NextRequest } from "next/server";
import { clientApiRouteAllowed, clientAuthEnforced, clientRouteAllowed } from "@/lib/clientRuntimePolicy";

export function middleware(request: NextRequest) {
  const incomingRequestId = request.headers.get("x-request-id")?.trim() ?? "";
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  if (!clientAuthEnforced()) return next(requestHeaders, requestId);

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/client-unavailable" ||
    pathname.startsWith("/api/client-auth/")
  ) return next(requestHeaders, requestId);

  if (pathname === "/status") {
    return withRequestId(NextResponse.json({ ok: true, service: "Veloce AgenticOS" }), requestId);
  }

  if (pathname.startsWith("/api/")) {
    return clientApiRouteAllowed(pathname)
      ? next(requestHeaders, requestId)
      : withRequestId(NextResponse.json({ ok: false, error: "client_route_not_enabled" }, { status: 403 }), requestId);
  }

  if (!clientRouteAllowed(pathname)) {
    const target = new URL("/client-unavailable", request.url);
    target.searchParams.set("route", pathname);
    return withRequestId(NextResponse.redirect(target), requestId);
  }

  if (!request.cookies.get("veloce_access_token")?.value) {
    const target = new URL("/login", request.url);
    target.searchParams.set("next", pathname);
    return withRequestId(NextResponse.redirect(target), requestId);
  }
  return next(requestHeaders, requestId);
}

function next(requestHeaders: Headers, requestId: string) {
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
