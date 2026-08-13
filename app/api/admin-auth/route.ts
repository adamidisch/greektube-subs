import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, adminPassword, adminSessionToken, safeEqual } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const password = adminPassword();
  if (!password) return NextResponse.json({ authorized: false }, { status: 503 });
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1) || "";
  return NextResponse.json({ authorized: safeEqual(cookie, await adminSessionToken(password)) });
}

export async function POST(request: Request) {
  const configuredPassword = adminPassword();
  if (!configuredPassword) return NextResponse.json({ error: "Η προστασία επεξεργασίας δεν έχει ρυθμιστεί." }, { status: 503 });
  const suppliedPassword = String((await request.json() as { password?: string }).password || "");
  if (!safeEqual(suppliedPassword, configuredPassword)) {
    return NextResponse.json({ error: "Ο κωδικός δεν είναι σωστός." }, { status: 401 });
  }
  const response = NextResponse.json({ authorized: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, await adminSessionToken(configuredPassword), {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
