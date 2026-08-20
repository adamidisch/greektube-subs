import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

export const dynamic = "force-dynamic";

const SNAPSHOT = "migration-snapshots/1787248505453-af0acba35d7e9a44.bin";

function previewOnly() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/neon-source-export-audit";
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("cleanup") !== "1") return new Response(null, { status: 404 });

  try {
    await del(SNAPSHOT);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ deleted: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
