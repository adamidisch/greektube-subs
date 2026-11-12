import { NextResponse } from "next/server";
import { readAnonymousId } from "@/app/profile-domain";
import { completeSignIn, normalizeEmail, setProfileCookie } from "@/lib/login-auth";
import { getAuth } from "@/lib/pro-auth/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Turns a verified Neon Auth session into this site's profile cookie, merging the guest data of this browser. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: "Η σύνδεση δεν είναι ενεργή ακόμη." }, { status: 503, headers: noStore });
  try {
    const result = await auth.getSession();
    const user = result.data?.user;
    const email = normalizeEmail(user?.email);
    if (!user || !email || user.emailVerified !== true) {
      return NextResponse.json({ error: "Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά." }, { status: 401, headers: noStore });
    }
    const guestId = readAnonymousId(request);
    const owner = await completeSignIn(email, guestId ? `anon:${guestId}` : null);
    const response = NextResponse.json({ ok: true, email }, { headers: noStore });
    setProfileCookie(response, owner.slice("anon:".length));
    return response;
  } catch {
    return NextResponse.json({ error: "Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά." }, { status: 500, headers: noStore });
  }
}
