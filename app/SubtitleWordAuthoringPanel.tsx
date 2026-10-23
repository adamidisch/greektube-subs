"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useAppLanguage } from "./app-language";
import { importWordTiming, parseAuthoringPlan, authoringRequest, authoringCounts, runAuthoringBatch,
  authoringAssemblyBody, authoringJobStorage, AuthoringClientError, type AuthoringJob } from "./subtitle-authoring-client";
import type { TimedCue } from "./subtitle-track";

type Props = { videoId: string; sourceHash: string; translationHash: string;
  onDraftReady: () => void; onBusyChange: (busy: boolean) => void; onSeek?: (time: number) => void };

function errorText(error: unknown) {
  const code = error instanceof AuthoringClientError ? error.code : "format";
  const messages: Record<string, [string, string]> = {
    source: ["Ο χρονισμός ανήκει σε διαφορετική πηγή.", "The timing belongs to a different source."],
    coverage: ["Οι λέξεις του αρχείου δεν συμφωνούν με την πηγή.", "The file's words do not match the source."],
    format: ["Δεν φορτώθηκε έγκυρο αρχείο χρονισμού.", "A valid timing file could not be loaded."],
    auth: ["Συνδέσου ως διαχειριστής για να συνεχίσεις.", "Sign in as an administrator to continue."],
    cooldown: ["Η επεξεργασία σταμάτησε στο όριο του παρόχου. Η πρόοδος διατηρήθηκε.", "Processing stopped at the provider limit. Progress was preserved."],
    changed: ["Η έκδοση άλλαξε ή η επεξεργασία δεν είναι διαθέσιμη. Φόρτωσε ξανά την αναφορά.", "The revision changed or processing is unavailable. Reload the report."],
    busy: ["Η μεταγραφή ενημερώνεται ήδη ή δεν είναι ακόμη έτοιμη.", "The transcript is being updated or is not ready yet."],
    preview: ["Η επεξεργασία υποτίτλων είναι διαθέσιμη μόνο στην κανονική έκδοση του ιστοτόπου.", "Subtitle processing is available only on the production website."],
    timing_missing: ["Δεν βρέθηκε ο αποθηκευμένος χρονισμός. Εισήγαγε ξανά το αρχείο.", "The saved timing was not found. Import the file again."],
    understanding_required: ["Λείπει η συνολική ανάλυση για αυτή την έκδοση του βίντεο. Πρέπει να ολοκληρωθεί πριν από τη μετάφραση τμημάτων.", "The whole-video analysis is missing for this revision. Complete it before translating sections."],
    repair: ["Το τμήμα χρειάζεται επιμέλεια. Η επεξεργασία σταμάτησε.", "This section needs editing. Processing stopped."],
    provider: ["Ο πάροχος δεν είναι διαθέσιμος. Η επεξεργασία σταμάτησε.", "The provider is unavailable. Processing stopped."],
    network: ["Η σύνδεση διακόπηκε. Η αποθηκευμένη πρόοδος διατηρήθηκε.", "The connection was interrupted. Saved progress was preserved."],
    storage: ["Δεν αποθηκεύτηκε η τοπική πρόοδος. Τα ολοκληρωμένα στάδια παραμένουν στον server.", "Local progress could not be saved. Completed stages remain on the server."],
    response: ["Δεν επιβεβαιώθηκε το αποτέλεσμα του σταδίου. Η επεξεργασία σταμάτησε.", "The stage result could not be confirmed. Processing stopped."],
    incomplete: ["Χρειάζεται ολοκλήρωση και διόρθωση όλων των τμημάτων πριν από τη σύνθεση.", "Complete and repair every section before assembly."],
  };
  const pair = messages[code] ?? messages.format; return tr(pair[0], pair[1]);
}

export default function SubtitleWordAuthoringPanel({ videoId, sourceHash, translationHash, onDraftReady, onBusyChange, onSeek }: Props) {
  useAppLanguage();
  const [job, setJob] = useState<AuthoringJob | null>(null), [busy, setBusy] = useState(false), [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null), [message, setMessage] = useState(""), [batch, setBatch] = useState("1");
  const [paused, setPaused] = useState(false), [clock, setClock] = useState(() => Date.now());
  const [analysis, setAnalysis] = useState<{ stage: string; completed: number; total: number } | null>(null);
  const [analysisRetryAt, setAnalysisRetryAt] = useState(0);
  const pendingTiming = useRef<File | null>(null);
  const [source, setSource] = useState<TimedCue[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const stop = useRef(false), mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    void authoringJobStorage(videoId).then(saved => {
      if (!active || !saved || saved.schemaVersion !== 1 || saved.videoId !== videoId) return;
      if (saved.sourceHash !== sourceHash || saved.translationHash !== translationHash) {
        setMessage("stale"); return;
      }
      // Revalidate persisted scope order; only the server can approve or assemble its checkpoints.
      const scopes = parseAuthoringPlan({ status: "planned", scopes: saved.scopes });
      const restored = scopes.map((scope, index) => ({ ...scope,
        phase: ["translation_ready", "draft_ready", "manual_review_required"].includes(saved.scopes[index].phase || "") ? saved.scopes[index].phase : undefined }));
      setJob({ ...saved, scopes: restored });
      setMessage("restored");
    }).catch(() => { if (active) setError(new AuthoringClientError("storage")); });
    return () => { active = false; };
  }, [videoId, sourceHash, translationHash]);
  useEffect(() => {
    const retryAt = Math.max(job?.retryAt || 0, analysisRetryAt);
    if (retryAt <= Date.now()) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(retryAt - Date.now() + 100, 86_400_100));
    return () => clearTimeout(timer);
  }, [job?.retryAt, analysisRetryAt]);

  async function save(next: AuthoringJob) {
    if (mounted.current) setJob(next);
    await authoringJobStorage(videoId, next);
  }
  async function load(file: File) {
    if (working.current) return;
    pendingTiming.current = file;
    working.current = true; setBusy(true); setError(null); setMessage("");
    try {
      if (file.size > 12_000_000) throw new AuthoringClientError("format");
      const raw = JSON.parse(await file.text());
      const response = await fetch(`/api/subtitle-review?videoId=${videoId}&download=report`, { cache: "no-store" });
      if (!response.ok) throw new AuthoringClientError(response.status === 401 ? "auth" : "network");
      const report = await response.json();
      if (report.sourceHash !== sourceHash || report.translationHash !== translationHash) throw new AuthoringClientError("changed");
      const reportSource = report.source || []; setSource(reportSource);
      const evidence = await importWordTiming(raw, reportSource, sourceHash);
      const result = await authoringRequest({ videoId, action: "plan", sourceHash, translationHash, audioEvidence: evidence });
      if (result.sourceHash !== sourceHash || result.translationHash !== translationHash) throw new AuthoringClientError("changed");
      const scopes = parseAuthoringPlan(result);
      if (typeof result.evidenceKey !== "string" || !/^[a-f0-9]{64}$/u.test(result.evidenceKey)) throw new AuthoringClientError("response");
      if (scopes.at(-1)!.range[1] !== reportSource.length - 1) throw new AuthoringClientError("coverage");
      // Restore only statuses with the exact same server-generated packet key.
      const previous = new Map(job?.scopes.filter(s => s.key).map(s => [s.key!, s.phase]) || []);
      await save({ schemaVersion: 1, videoId, sourceHash, translationHash, audioEvidence: evidence,
        evidenceKey: result.evidenceKey, scopes: scopes.map(s => ({ ...s, phase: s.key ? previous.get(s.key) : undefined })), fileName: file.name });
      setMessage("loaded"); setAnalysis(null); pendingTiming.current = null;
    } catch (issue) { if (mounted.current) setError(issue); }
    finally { working.current = false; if (mounted.current) setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function prepareAnalysis() {
    if (working.current || analysisRetryAt > Date.now()) return;
    working.current = true; setBusy(true); setError(null); setMessage("");
    setAnalysis(previous => previous ?? { stage: "sections", completed: 0, total: 0 });
    let ready = false;
    try {
      const result = await authoringRequest({ videoId, action: "prepare", sourceHash, translationHash });
      if (!["analysis_ready", "analysis_progress"].includes(String(result.status))
        || !["sections", "synthesis", "complete"].includes(String(result.stage))
        || !Number.isInteger(result.completed) || !Number.isInteger(result.total)
        || Number(result.completed) < 0 || Number(result.total) < 1 || Number(result.completed) > Number(result.total))
        throw new AuthoringClientError("response");
      setAnalysis({ stage: String(result.stage), completed: Number(result.completed), total: Number(result.total) });
      setAnalysisRetryAt(0); ready = result.status === "analysis_ready";
    } catch (issue) {
      if (mounted.current) { setError(issue); if (issue instanceof AuthoringClientError && issue.retryAt) setAnalysisRetryAt(issue.retryAt); }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
    if (ready && mounted.current && pendingTiming.current) await load(pendingTiming.current);
  }
  async function run() {
    if (!job || working.current) return;
    working.current = true; stop.current = false; setBusy(true); setRunning(true); setPaused(false); setError(null); setMessage("");
    try {
      await runAuthoringBatch(job, batch === "all" ? job.scopes.length : Number(batch), () => stop.current, save);
      if (mounted.current) setMessage(stop.current ? "paused" : "complete");
    } catch (issue) { if (mounted.current) setError(issue); }
    finally { working.current = false; if (mounted.current) { setBusy(false); setRunning(false); setPaused(false); } }
  }
  async function assemble() {
    if (!job || working.current) return;
    working.current = true; setBusy(true); setError(null); setMessage("");
    try {
      const result = await authoringRequest(authoringAssemblyBody(job));
      if (result.status !== "draft_ready") throw new AuthoringClientError("response");
      if (mounted.current) onDraftReady();
    } catch (issue) { if (mounted.current) setError(issue); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  const messages: Record<string, [string, string]> = {
    stale: ["Η παλιά τοπική πρόοδος αφορά διαφορετική έκδοση. Εισήγαγε τον νέο χρονισμό.", "Previous local progress belongs to a different revision. Import the new timing."],
    restored: ["Η αποθηκευμένη πρόοδος είναι διαθέσιμη. Η συνέχεια ξεκινά μόνο όταν επιλέξεις επεξεργασία.", "Saved progress is available. Processing resumes only when you choose to continue."],
    loaded: ["Ο χρονισμός φορτώθηκε. Δεν εκτελέστηκε μετάφραση.", "Timing loaded. No translation was run."],
    paused: ["Η επεξεργασία τέθηκε σε παύση. Η πρόοδος αποθηκεύτηκε.", "Processing paused. Progress was saved."],
    complete: ["Η επιλεγμένη επεξεργασία ολοκληρώθηκε. Το αποτέλεσμα παραμένει προσχέδιο.", "Selected processing completed. The result remains a draft."],
  };
  const counts = job ? authoringCounts(job) : null;
  const cooling = Boolean(job?.retryAt && job.retryAt > clock);
  const blocked = job?.scopes.filter(s => s.status !== "ready" || s.phase === "manual_review_required") || [];
  const selected = counts ? Math.min(batch === "all" ? counts.remaining : Number(batch), counts.remaining) : 0;
  return <details className="subtitle-word-authoring">
    <summary>{tr("Υπότιτλοι από τον χρονισμό ήχου", "Subtitles from audio timing")}</summary>
    <p>{tr("Εισήγαγε το αρχείο χρονισμού. Η μετάφραση και ο ξεχωριστός έλεγχος εκτελούνται μόνο όταν επιλέξεις επεξεργασία.", "Import the timing file. Translation and independent review run only when you choose to process sections.")}</p>
    <div className="subtitle-quality-actions"><input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label={tr("Αρχείο χρονισμού ήχου", "Audio timing file")} onChange={event => { const file = event.target.files?.[0]; if (file) void load(file); }}/><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{tr("Εισαγωγή χρονισμού", "Import timing")}</button></div>
    {(analysis || error instanceof AuthoringClientError && error.code === "understanding_required") && <div className="subtitle-authoring-preparation">
      <p>{tr("Η ανάλυση διαβάζει ολόκληρη τη συζήτηση πριν από τη μετάφραση. Κάθε επιλογή εκτελεί έως ένα αίτημα. Τα ολοκληρωμένα στάδια επαναχρησιμοποιούνται.", "Analysis reads the whole discussion before translation. Each click runs at most one request. Completed stages are reused.")}</p>
      {analysis && <p role="status">{analysis.stage === "complete" ? tr("Η συνολική ανάλυση ολοκληρώθηκε.", "Whole-video analysis completed.") : `${analysis.stage === "synthesis" ? tr("Σύνθεση ανάλυσης", "Analysis synthesis") : tr("Ανάλυση τμημάτων", "Section analysis")}: ${analysis.completed}/${analysis.total || "…"}`}</p>}
      <div className="subtitle-quality-actions"><button type="button" disabled={busy || analysisRetryAt > clock || analysis?.stage === "complete"} onClick={() => void prepareAnalysis()}>{analysis ? tr("Συνέχεια ανάλυσης", "Continue analysis") : tr("Προετοιμασία ανάλυσης", "Prepare analysis")}</button></div>
      {analysisRetryAt > clock && <p role="status">{tr("Διαθέσιμη συνέχεια μετά τις", "Resume available after")} {new Date(analysisRetryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.</p>}
    </div>}
    {job && <><p className="subtitle-authoring-filename">{job.fileName}</p>
      <dl className="subtitle-authoring-stats"><div><dt>{tr("Ολοκληρωμένα", "Completed")}</dt><dd>{counts!.complete}/{counts!.ready}</dd></div><div><dt>{tr("Προς επεξεργασία", "Remaining")}</dt><dd>{counts!.remaining}</dd></div><div><dt>{tr("Προς διόρθωση", "Needs repair")}</dt><dd>{counts!.blocked}</dd></div></dl>
      <progress max={Math.max(1, counts!.ready)} value={counts!.complete} aria-label={tr("Πρόοδος επιμέλειας", "Authoring progress")}/>
      <label className="subtitle-authoring-batch">{tr("Τμήματα σε αυτή την εκτέλεση", "Sections in this run")}<select value={batch} disabled={busy} onChange={event => setBatch(event.target.value)}><option value="1">{tr("1 τμήμα", "1 section")}</option><option value="5">{tr("5 τμήματα", "5 sections")}</option><option value="all">{tr("Όλα τα έτοιμα τμήματα", "All ready sections")}</option></select></label>
      <p>{selected ? tr(`Έως ${selected * 2} αιτήματα στον πάροχο μετάφρασης. Τα αποθηκευμένα στάδια επαναχρησιμοποιούνται.`, `Up to ${selected * 2} translation provider requests. Saved stages are reused.`)
        : tr("Τα έτοιμα τμήματα έχουν ολοκληρωθεί.", "All ready sections have been completed.")}</p>
      <div className="subtitle-quality-actions"><button type="button" disabled={busy || cooling || !counts!.remaining} onClick={() => void run()}>{tr("Επεξεργασία τμημάτων", "Process sections")}</button>{running && <button type="button" disabled={paused} onClick={() => { stop.current = true; setPaused(true); }}>{paused ? tr("Παύση μετά το τρέχον στάδιο", "Pausing after the current stage") : tr("Παύση", "Pause")}</button>}<button type="button" disabled={busy || counts!.blocked > 0 || counts!.complete !== job.scopes.length} onClick={() => void assemble()}>{tr("Σύνθεση προσχεδίου", "Assemble draft")}</button></div>
      {cooling && <p role="status">{tr("Διαθέσιμη συνέχεια μετά τις", "Resume available after")} {new Date(job.retryAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.</p>}
      {blocked.length > 0 && <details><summary>{tr("Τμήματα που χρειάζονται διόρθωση", "Sections needing repair")} ({blocked.length})</summary><p>{tr("Η σύνθεση προσχεδίου απαιτεί διόρθωση όλων των τμημάτων. Τα έτοιμα τμήματα μπορούν να επεξεργαστούν ξεχωριστά.", "Draft assembly requires every section to be repaired. Ready sections can be processed separately.")}</p><ol>{blocked.slice(0, 20).map(s => <li key={s.range[0]}>{onSeek && source[s.range[0]] ? <button type="button" onClick={() => onSeek(source[s.range[0]].start)}>{tr("Τμήμα", "Section")} {s.range[0] + 1}</button> : <span>{tr("Τμήμα", "Section")} {s.range[0] + 1}</span>}</li>)}</ol></details>}
    </>}
    {busy && <p role="status">{paused ? tr("Ολοκλήρωση τρέχοντος σταδίου πριν από την παύση…", "Finishing the current stage before pausing…") : tr("Επεξεργασία…", "Processing…")}</p>}
    {error!==null && <p role="alert">{errorText(error)}</p>}{message && messages[message] && <p role="status">{tr(...messages[message])}</p>}
  </details>;
}
