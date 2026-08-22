import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PROFILE_COOKIE, validAnonymousId } from "@/app/profile-domain";

export function proxy(request: NextRequest) {
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
  matcher: "/",
};
