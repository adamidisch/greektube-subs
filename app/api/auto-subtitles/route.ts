import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { verifyAdminSession } from "@/lib/admin-auth";
import { monthUsage, runSummary, startRun } from "./runner";
import { MONTHLY_LIMITS } from "./batched";
import { autoSubtitlesWorkflow } from "./workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const validVideoId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/u.test(value) ? value : "";
const validKind = (value: unknown) => value === "sample" ? "sample" as const : "full" as const;
type Summary = NonNullable<Awaited<ReturnType<typeof runSummary>>>;
/** Shape the owner panel (AutoSubtitlesFlow) already understands, plus the run details. */
function compat(run: Summary | null) {
  if (!run) return { status: "none" };
  const status = run.status === "running" || run.status === "published" || run.status === "failed" ? run.status : "held";
  return { status, stage: run.status === "running" ? "authoring" : "done", scopes: run.scopes, issues: run.issues ?? run.remaining,
    published: run.published, lastError: run.lastError ?? run.stopReason, startedAt: run.startedAt, finishedAt: run.finishedAt, run };
}

/** Admin: latest run of a video (estimate, usage, measurement, remaining work) and this month's usage. */
export async function GET(request: Request) {
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  const url = new URL(request.url), videoId = validVideoId(url.searchParams.get("videoId"));
  if (!videoId) return json({ error: "Μη έγκυρο βίντεο." }, 400);
  const kind = url.searchParams.get("kind");
  const run = await runSummary(videoId, kind === "sample" || kind === "full" ? kind : "full");
  return json({ ...compat(run), month: await monthUsage(), monthlyLimits: MONTHLY_LIMITS });
}

/** Admin: start a run (kind "sample" = first 2 minutes, never published; "full" = whole video). Without a capture,
 *  continues from the latest run of that kind, reusing its finished work. */
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Μη έγκυρη προέλευση." }, 403);
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  if (process.env.VERCEL_ENV === "preview") return json({ error: "Η αυτόματη ροή είναι απενεργοποιημένη στο preview." }, 409);
  // "resume" (owner panel) starts a new run from the latest one, reusing its saved work.
  const raw = await request.text();
  if (raw.length > 4_000_000) return json({ error: "Η λήψη λέξεων είναι πολύ μεγάλη." }, 413);
  let body: { videoId?: unknown; capture?: unknown; kind?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Μη έγκυρο αίτημα." }, 400); }
  const videoId = validVideoId(body.videoId);
  if (!videoId) return json({ error: "Μη έγκυρο βίντεο." }, 400);
  try {
    const state = await startRun(videoId, validKind(body.kind), body.capture);
    await start(autoSubtitlesWorkflow, [state.runId]);
    return json({ status: "running", stage: "authoring", runId: state.runId, kind: state.kind, estimate: state.estimate, limits: state.limits }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Δεν ξεκίνησε η αυτόματη επεξεργασία." }, 409);
  }
}
