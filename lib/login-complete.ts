import { readAnonymousId } from "@/app/profile-domain";
import { completeSignIn, normalizeEmail } from "@/lib/login-auth";
import { getAuth } from "@/lib/pro-auth/server";

export type LoginCompletion =
  | { ok: true; owner: string; email: string }
  | { ok: false; reason: "unavailable" | "no_session" | "unverified" | "failed" };

/** Turns the verified Neon Auth session into this site's profile owner, merging this browser's guest data. */
export async function completeLoginFromSession(request: Request): Promise<LoginCompletion> {
  const auth = getAuth();
  if (!auth) return { ok: false, reason: "unavailable" };
  try {
    const result = await auth.getSession();
    const user = result.data?.user;
    const email = normalizeEmail(user?.email);
    if (!user || !email) return { ok: false, reason: "no_session" };
    if (user.emailVerified !== true) return { ok: false, reason: "unverified" };
    const guestId = readAnonymousId(request);
    const owner = await completeSignIn(email, guestId ? `anon:${guestId}` : null);
    return { ok: true, owner, email };
  } catch (error) {
    console.error("[login] completion failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "failed" };
  }
}
