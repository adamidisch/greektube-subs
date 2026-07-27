import { NextResponse } from "next/server";

const COOKIE = "greektube-admin";
const SESSION_MESSAGE = "greektube-edit-authorized";

async function secret() {
  const workers = await import("cloudflare:workers");
  return String(workers.env.ADMIN_EDIT_PASSWORD || "");
}

async function sessionToken(password: string) {
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

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function GET(request: Request) {
  const password = await secret();
  if (!password) return NextResponse.json({ authorized: false }, { status: 503 });
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
  return NextResponse.json({ authorized: safeEqual(cookie, await sessionToken(password)) });
}

export async function POST(request: Request) {
  const configuredPassword = await secret();
  if (!configuredPassword) return NextResponse.json({ error: "Η προστασία επεξεργασίας δεν έχει ρυθμιστεί." }, { status: 503 });
  const suppliedPassword = String((await request.json() as { password?: string }).password || "");
  if (!safeEqual(suppliedPassword, configuredPassword)) {
    return NextResponse.json({ error: "Ο κωδικός δεν είναι σωστός." }, { status: 401 });
  }
  const response = NextResponse.json({ authorized: true });
  response.cookies.set(COOKIE, await sessionToken(configuredPassword), {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
