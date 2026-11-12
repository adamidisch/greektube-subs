import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;
let instance: NeonAuth | null | undefined;

export function neonAuthConfigured() {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  return Boolean(process.env.NEON_AUTH_BASE_URL && secret && secret.length >= 32);
}

/** Lazy on purpose: builds and the guest experience must keep working while sign-in is not configured yet. */
export function getAuth(): NeonAuth | null {
  if (instance !== undefined) return instance;
  instance = neonAuthConfigured()
    ? createNeonAuth({
        baseUrl: process.env.NEON_AUTH_BASE_URL as string,
        cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET as string },
      })
    : null;
  return instance;
}
