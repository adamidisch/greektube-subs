export const PROFILE_COOKIE = "greektube-user";
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9-]{12,80}$/;

export function validAnonymousId(value: string | null | undefined) {
  return Boolean(value && ANONYMOUS_ID_PATTERN.test(value));
}

export function readAnonymousId(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${PROFILE_COOKIE}=`))
    ?.slice(PROFILE_COOKIE.length + 1) || null;
  return validAnonymousId(value) ? value : null;
}

export async function profileOwnerKey(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  if (email) {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map(value => value.toString(16).padStart(2, "0"))
      .join("");
    return `user:${hash}`;
  }
  const anonymousId = readAnonymousId(request);
  return anonymousId ? `anon:${anonymousId}` : null;
}

export function usernameKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function validateUsername(value: string) {
  const username = value.normalize("NFKC").trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { ok: false as const, error: `Το όνομα πρέπει να έχει ${USERNAME_MIN}–${USERNAME_MAX} χαρακτήρες.` };
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(username)) {
    return { ok: false as const, error: "Χρησιμοποίησε μόνο γράμματα, αριθμούς, _ ή -." };
  }
  return { ok: true as const, username, key: usernameKey(username) };
}

export function automaticUsername(publicId: string | number | bigint) {
  return `User${Number(publicId) + 1000}`;
}
