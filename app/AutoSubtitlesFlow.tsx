"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tr } from "./app-language";

type Issue = { start: number; end: number; english: string; issue: string };
type Summary = {
  status: "none" | "running" | "held" | "published" | "failed";
  stage?: "understanding" | "authoring" | "publishing" | "done";
  scopes?: { total: number; ready: number; flagged: number };
  words?: number; startedAt?: string; finishedAt?: string; lastError?: string; error?: string;
  issues?: Issue[]; published?: { events: number; fastPages: number; shortPages: number };
};
type CaptureResult = { capture?: unknown; error?: string };

/** Detects the GreekTube Capture extension and asks it for a video's YouTube word timings. */
export function useCaptureExtension() {
  const [ready, setReady] = useState<boolean | null>(null);
  const pending = useRef(new Map<string, (result: CaptureResult) => void>());
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string; requestId?: string } & CaptureResult;
      if (data?.source !== "greektube-capture") return;
      if (data.type === "ready") setReady(true);
      if (data.type === "capture-result" && data.requestId) {
        pending.current.get(data.requestId)?.({ capture: data.capture, error: data.error });
        pending.current.delete(data.requestId);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ source: "greektube", type: "ping" }, window.location.origin);
    const timer = window.setTimeout(() => setReady(current => current ?? false), 1500);
    return () => { window.removeEventListener("message", listener); window.clearTimeout(timer); };
  }, []);
  const capture = useCallback((videoId: string) => new Promise<CaptureResult>(resolve => {
    const requestId = `${videoId}-${Date.now()}`;
    const timer = window.setTimeout(() => { pending.current.delete(requestId); resolve({ error: tr("Η επέκταση δεν απάντησε εγκαίρως.") }); }, 150_000);
    pending.current.set(requestId, result => { window.clearTimeout(timer); resolve(result); });
    window.postMessage({ source: "greektube", type: "capture-request", videoId, requestId }, window.location.origin);
  }), []);
  return { ready, capture };
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

/** Runs (or follows) the automatic subtitles of one video: capture → server job → published or held lines. */
export default function AutoSubtitlesFlow({ videoId, start, openVideo }: { videoId: string; start: boolean; openVideo?: () => void }) {
  const { ready, capture } = useCaptureExtension();
  const [phase, setPhase] = useState<"idle" | "capturing" | "sending" | "following">(start ? "idle" : "following");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/auto-subtitles?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store", credentials: "same-origin" });
    const data = await response.json().catch(() => ({})) as Summary;
    if (!response.ok) throw new Error(data.error || tr("Η κατάσταση δεν φορτώθηκε."));
    setSummary(data);
    return data;
  }, [videoId]);

  const begin = useCallback(async () => {
    setError(""); setPhase("capturing");
    const result = await capture(videoId);
    if (!result.capture) { setError(result.error || tr("Η λήψη λέξεων απέτυχε.")); setPhase("idle"); return; }
    setPhase("sending");
    const response = await fetch("/api/auto-subtitles", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, capture: result.capture }) });
    const data = await response.json().catch(() => ({})) as Summary;
    if (!response.ok) { setError(data.error || tr("Η αυτόματη επεξεργασία δεν ξεκίνησε.")); setPhase("idle"); return; }
    setSummary(data); setPhase("following");
  }, [capture, videoId]);

  useEffect(() => {
    if (!start || started.current || ready !== true) return;
    started.current = true;
    void begin();
  }, [begin, ready, start]);

  useEffect(() => {
    if (phase !== "following") return;
    let active = true, timer = 0;
    const tick = async () => {
      try { const data = await refresh(); if (active && data.status === "running") timer = window.setTimeout(tick, 8000); }
      catch (problem) { if (active) { setError(problem instanceof Error ? problem.message : tr("Σφάλμα")); timer = window.setTimeout(tick, 15000); } }
    };
    void tick();
    return () => { active = false; window.clearTimeout(timer); };
  }, [phase, refresh]);

  async function resume() {
    setError("");
    const response = await fetch("/api/auto-subtitles", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action: "resume" }) });
    const data = await response.json().catch(() => ({})) as Summary;
    if (!response.ok) { setError(data.error || tr("Η συνέχεια απέτυχε.")); return; }
    setSummary(data); setPhase("idle"); window.setTimeout(() => setPhase("following"), 0);
  }

  const scopes = summary?.scopes;
  const percent = summary?.status === "published" ? 100
    : summary?.stage === "publishing" ? 96
    : summary?.stage === "authoring" && scopes?.total ? 12 + Math.round(82 * (scopes.ready + scopes.flagged) / scopes.total)
    : summary?.status === "running" ? 6 : phase === "capturing" || phase === "sending" ? 3 : 0;

  let headline = "", detail = "";
  if (start && ready === false && phase === "idle" && !summary) {
    headline = tr("Χρειάζεται η επέκταση GreekTube Capture.");
    detail = tr("Εγκατάστησε την επέκταση στον Chrome και άνοιξε ξανά αυτό το παράθυρο.");
  } else if (phase === "capturing") {
    headline = tr("Λήψη λέξεων από το YouTube…");
    detail = tr("Ανοίγει για λίγα δευτερόλεπτα μια καρτέλα του YouTube. Άφησε τον Chrome ανοιχτό.");
  } else if (phase === "sending") {
    headline = tr("Αποστολή στο GreekTube…");
  } else if (summary?.status === "running") {
    headline = summary.stage === "understanding" ? tr("Ανάλυση όλου του βίντεο…")
      : summary.stage === "publishing" ? tr("Τελικοί έλεγχοι και δημοσίευση…")
      : tr(`Μετάφραση και έλεγχος: ${scopes?.ready ?? 0} από ${scopes?.total ?? 0} τμήματα`);
    detail = tr("Μπορείς να κλείσεις αυτό το παράθυρο. Η επεξεργασία συνεχίζεται στον server.");
  } else if (summary?.status === "published") {
    headline = tr("Οι υπότιτλοι δημοσιεύτηκαν.");
    detail = tr(`${summary.published?.events ?? 0} εμφανίσεις, καμία πολύ γρήγορη για ανάγνωση.`);
  } else if (summary?.status === "held") {
    headline = tr("Δεν δημοσιεύτηκε. Κάποια σημεία χρειάζονται έλεγχο.");
    detail = tr("Τα υπόλοιπα είναι έτοιμα και αποθηκευμένα.");
  } else if (summary?.status === "failed") {
    headline = tr("Η αυτόματη επεξεργασία σταμάτησε.");
    detail = summary.lastError || "";
  }
  if (!start && (!summary || summary.status === "none")) return null;

  return <div className="auto-subtitles-flow" aria-live="polite">
    {headline && <p className="auto-subtitles-headline">{headline}</p>}
    {(percent > 0 && summary?.status !== "held" && summary?.status !== "failed") && <div className="auto-subtitles-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }}/></div>}
    {detail && <p className="auto-subtitles-detail">{detail}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {summary?.status === "held" && summary.issues?.length ? <ol className="auto-subtitles-issues">
      {summary.issues.map((issue, index) => <li key={index}><b>{clock(issue.start)}–{clock(issue.end)}</b>{issue.english && <span lang="en">{issue.english}</span>}<small>{issue.issue}</small></li>)}
    </ol> : null}
    <div className="modal-actions auto-subtitles-actions">
      {start && ready === true && phase === "idle" && !summary && <button type="button" className="primary" onClick={() => void begin()}>{tr("Δοκίμασε ξανά")}</button>}
      {(summary?.status === "held" || summary?.status === "failed") && <button type="button" className="secondary" onClick={() => void resume()}>{tr("Συνέχεια επεξεργασίας")}</button>}
      {summary?.status === "published" && openVideo && <button type="button" className="primary" onClick={openVideo}>{tr("Άνοιγμα βίντεο")}</button>}
    </div>
  </div>;
}
