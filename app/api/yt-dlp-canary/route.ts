import { NextResponse } from "next/server";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const DEFAULT_VIDEO = "D2RjneeG_xA";
const YT_DLP_BINARY = "/tmp/yt-dlp-greektube";
const YT_DLP_DOWNLOAD = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

async function ensureYtDlp() {
  try {
    const info = await stat(YT_DLP_BINARY);
    if (info.size > 1_000_000) return;
  } catch {
    // Cold start: download the official standalone Linux binary into writable /tmp.
  }

  const response = await fetch(YT_DLP_DOWNLOAD, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`yt-dlp-download:${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000) throw new Error(`yt-dlp-download-too-small:${bytes.byteLength}`);
  await writeFile(YT_DLP_BINARY, bytes);
  await chmod(YT_DLP_BINARY, 0o755);
}

function countVttCues(vtt: string) {
  return vtt.split(/\r?\n/).filter(line => /-->/.test(line)).length;
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "preview-only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim() || DEFAULT_VIDEO;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "invalid-video-id" }, { status: 400 });
  }

  const startedAt = Date.now();
  const workDir = path.join("/tmp", `yt-dlp-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    await ensureYtDlp();
    const version = (await execFileAsync(YT_DLP_BINARY, ["--version"], { timeout: 8_000 })).stdout.trim();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(workDir, "%(id)s.%(ext)s");

    const run = await execFileAsync(
      YT_DLP_BINARY,
      [
        "--write-auto-sub",
        "--sub-lang", "en",
        "--skip-download",
        "--sub-format", "vtt",
        "--no-playlist",
        "--no-cache-dir",
        "-o", outputTemplate,
        videoUrl,
      ],
      { timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const files = await readdir(workDir);
    const vttName = files.find(name => name.toLowerCase().endsWith(".vtt"));
    if (!vttName) {
      throw new Error(`yt-dlp-no-vtt:${run.stderr.trim() || run.stdout.trim() || "no subtitle file"}`);
    }

    const vtt = await readFile(path.join(workDir, vttName), "utf8");
    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      source: "yt-dlp-youtube-auto",
      ytDlpVersion: version,
      subtitleFile: vttName,
      bytes: Buffer.byteLength(vtt),
      cueCount: countVttCues(vtt),
      elapsedMs: Date.now() - startedAt,
      stderr: run.stderr.trim().slice(0, 1200),
    };
    console.info("[yt-dlp-canary-result]", JSON.stringify(result));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "yt-dlp-canary-failed";
    const detail = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr || "").trim().slice(0, 2000)
      : "";
    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      error: message,
      detail,
      elapsedMs: Date.now() - startedAt,
    };
    console.error("[yt-dlp-canary-error]", JSON.stringify(result));
    return NextResponse.json(result, { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
