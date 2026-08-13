export const ADMIN_SESSION_COOKIE = "greektube-admin";
const SESSION_MESSAGE = "greektube-edit-authorized";

export function adminPassword() {
  return String(process.env.ADMIN_EDIT_PASSWORD || "");
}

export async function adminSessionToken(password: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function cookieValue(request: Request) {
  return request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1) || "";
}

// Server-side admin verification for any route that needs it. Never exported
// from a route.ts file — imported here instead so Next.js doesn't treat it
// as an accidental extra route export.
export async function verifyAdminSession(request: Request) {
  const password = adminPassword();
  if (!password) return false;
  return safeEqual(cookieValue(request), await adminSessionToken(password));
}
