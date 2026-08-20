import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { database } from "@/db/postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function previewOnly() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/neon-source-export-audit";
}

function safeStringify(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

async function snapshotRows() {
  const db = database();
  const [appState, personalStates, videoTranscripts, userProfiles, analyticsEvents, translationCommands, translationQualityReviews] = await Promise.all([
    db.query("SELECT * FROM app_state ORDER BY key"),
    db.query("SELECT * FROM personal_states ORDER BY owner_key"),
    db.query("SELECT * FROM video_transcripts ORDER BY video_id"),
    db.query("SELECT * FROM user_profiles ORDER BY public_id"),
    db.query("SELECT * FROM analytics_events ORDER BY id"),
    db.query("SELECT * FROM translation_commands ORDER BY issue_number"),
    db.query("SELECT * FROM translation_quality_reviews ORDER BY video_id"),
  ]);

  return {
    createdAt: new Date().toISOString(),
    tables: {
      app_state: appState,
      personal_states: personalStates,
      video_transcripts: videoTranscripts,
      user_profiles: userProfiles,
      analytics_events: analyticsEvents,
      translation_commands: translationCommands,
      translation_quality_reviews: translationQualityReviews,
    },
  };
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const cleanupUrl = url.searchParams.get("cleanup");
  if (cleanupUrl) {
    try {
      await del(cleanupUrl);
      return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return NextResponse.json({ deleted: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }

  try {
    const snapshot = await snapshotRows();
    const plaintext = Buffer.from(safeStringify(snapshot), "utf8");
    const gzipped = gzipSync(plaintext, { level: 9 });

    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(gzipped), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope = Buffer.concat([Buffer.from("GTSMIG1"), iv, tag, ciphertext]);
    const nonce = randomBytes(8).toString("hex");
    const pathname = `migration-snapshots/${Date.now()}-${nonce}.bin`;
    const blob = await put(pathname, envelope, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: "application/octet-stream",
    });

    const tables = snapshot.tables as Record<string, unknown[]>;
    const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));

    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname,
      keyB64: key.toString("base64"),
      sha256: createHash("sha256").update(plaintext).digest("hex"),
      counts,
      bytes: {
        plaintext: plaintext.length,
        gzipped: gzipped.length,
        encrypted: envelope.length,
      },
    }, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
