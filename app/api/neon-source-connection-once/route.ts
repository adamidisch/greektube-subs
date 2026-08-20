import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const allowed = process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/neon-source-export-audit";

  if (!allowed) return new Response(null, { status: 404 });

  const source = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
  if (!source) return NextResponse.json({ error: "source-not-configured" }, { status: 500 });

  return NextResponse.json({ source }, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
