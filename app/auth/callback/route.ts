import { NextResponse } from "next/server";
import { setProfileCookie } from "@/lib/login-auth";
import { completeLoginFromSession } from "@/lib/login-complete";

export const dynamic = "force-dynamic";

/**
 * Return point after Google sign-in. proxy.ts has already exchanged Neon's one-time
 * verifier for the session cookie; here the session becomes this site's profile.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await completeLoginFromSession(request);
  if (!result.ok) {
    console.warn("[login] google return without usable session:", result.reason);
    const response = NextResponse.redirect(new URL("/login?error=google", url.origin));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.redirect(new URL("/login?signed_in=1", url.origin));
  response.headers.set("Cache-Control", "no-store");
  setProfileCookie(response, result.owner.slice("anon:".length));
  return response;
}
