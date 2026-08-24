import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "preview-only" }, { status: 403 });
  const url = "https://r.jina.ai/http://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s";
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return NextResponse.json({ status: response.status, length: text.length, head: text.slice(0, 12000) }, { headers: { "Cache-Control": "no-store" } });
}
