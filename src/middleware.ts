import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const authHeader = request.headers.get("authorization");
  const hasBearerAuth = !!authHeader?.startsWith("Bearer ");
  const hasPortalSession =
    !!request.cookies.get("superapp_token")?.value ||
    !!request.cookies.get("auth_token")?.value;

  if (
    request.method === "GET" &&
    hasBearerAuth &&
    !hasPortalSession &&
    pathname !== "/portal/connect" &&
    !pathname.startsWith("/api/")
  ) {
    const connectUrl = request.nextUrl.clone();
    connectUrl.pathname = "/portal/connect";
    connectUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.rewrite(connectUrl);
  }

  // Basic auth gate for privileged pages/APIs.
  // Full permission checks still happen server-side in pages/actions/routes.
  // if (
  //   pathname.startsWith("/dashboard") ||
  //   pathname.startsWith("/api/permissions") ||
  //   pathname.startsWith("/api/upload")
  // ) {
  //   const token = request.cookies.get("auth_token")?.value;
  //   if (!token) {
  //     if (pathname.startsWith("/api/")) {
  //       return NextResponse.json(
  //         { message: "Authentication required" },
  //         { status: 401 },
  //       );
  //     }
  //     const url = request.nextUrl.clone();
  //     url.pathname = "/login";
  //     url.searchParams.set("next", pathname);
  //     return NextResponse.redirect(url);
  //   }
  // }

  return NextResponse.next();
}
