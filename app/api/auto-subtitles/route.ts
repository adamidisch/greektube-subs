import { after, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isStalled, jobSummary, kickStep, readJob, resumeJob, startJob } from "./pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const validVideoId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/u.test(value) ? value : "";

/** Admin: status of the automatic subtitles of one video. A stalled job is continued. */
export async function GET(request: Request) {
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  const videoId = validVideoId(new URL(request.url).searchParams.get("videoId"));
  if (!videoId) return json({ error: "Μη έγκυρο βίντεο." }, 400);
  const current = await readJob(videoId);
  if (!current) return json({ status: "none", videoId });
  if (isStalled(current.job)) {
    const origin = new URL(request.url).origin, { runId } = current.job;
    after(() => kickStep(origin, videoId, runId));
  }
  return json(jobSummary(current.job));
}

/** Admin: start with the word timings captured by the GreekTube Capture extension, or resume. */
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Μη έγκυρη προέλευση." }, 403);
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  if (process.env.VERCEL_ENV === "preview") return json({ error: "Η αυτόματη ροή είναι απενεργοποιημένη στο preview." }, 409);
  const raw = await request.text();
  if (raw.length > 4_000_000) return json({ error: "Η λήψη λέξεων είναι πολύ μεγάλη." }, 413);
  let body: { videoId?: unknown; capture?: unknown; action?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Μη έγκυρο αίτημα." }, 400); }
  const videoId = validVideoId(body.videoId);
  if (!videoId) return json({ error: "Μη έγκυρο βίντεο." }, 400);
  try {
    const job = body.action === "resume" ? await resumeJob(videoId) : await startJob(videoId, body.capture);
    const origin = new URL(request.url).origin;
    if (job.status === "running") after(() => kickStep(origin, videoId, job.runId));
    return json(jobSummary(job), 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Δεν ξεκίνησε η αυτόματη επεξεργασία." }, 409);
  }
}
