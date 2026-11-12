import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PROFILE_COOKIE, validAnonymousId } from "@/app/profile-domain";
import { getAuth } from "@/lib/pro-auth/server";

export async function proxy(request: NextRequest) {
  // Returning from Google: exchange Neon's one-time verifier for the session cookie.
  // The return path must differ from loginUrl, otherwise the library skips the exchange.
  if (request.nextUrl.pathname === "/auth/callback") {
    const auth = getAuth();
    if (auth && request.nextUrl.searchParams.has("neon_auth_session_verifier")) {
      return auth.middleware({ loginUrl: "/login?error=google" })(request);
    }
    return NextResponse.next();
  }
  if (request.headers.get("oai-authenticated-user-email")) return NextResponse.next();
  const current = request.cookies.get(PROFILE_COOKIE)?.value;
  if (validAnonymousId(current)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(PROFILE_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/", "/auth/callback"],
};
