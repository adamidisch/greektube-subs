import { NextResponse } from "next/server";
import { setProfileCookie } from "@/lib/login-auth";
import { completeLoginFromSession } from "@/lib/login-complete";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ reason: "origin" }, { status: 403, headers: noStore });
  const result = await completeLoginFromSession(request);
  if (!result.ok) {
    const status = result.reason === "unavailable" ? 503 : result.reason === "failed" ? 500 : 401;
    return NextResponse.json({ reason: result.reason }, { status, headers: noStore });
  }
  const response = NextResponse.json({ ok: true, email: result.email }, { headers: noStore });
  setProfileCookie(response, result.owner.slice("anon:".length));
  return response;
}
