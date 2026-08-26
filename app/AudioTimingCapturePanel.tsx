"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";

export type AudioTimingPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
};

type CapturePhase = "idle" | "permission" | "recording" | "uploading" | "queued" | "processing" | "ready" | "error";
type TimingJob = { jobId: string; status: string; stage: string; progress: number; errorMessage?: string | null };

const YOUTUBE_PLAYING = 1;
const YOUTUBE_ENDED = 0;

function clock(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function recorderMimeType() {
  for (const value of ["audio/webm;codecs=opus", "audio/webm", "video/webm;codecs=opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(value)) return value;
  }
  return "";
}

function phaseLabel(phase: CapturePhase, stage: string) {
  if (phase === "permission") return "Επίλεξε αυτή την καρτέλα και ενεργοποίησε τον ήχο καρτέλας.";
  if (phase === "recording") return "Η καταγραφή ακολουθεί την πραγματική αναπαραγωγή στο 1×.";
  if (phase === "uploading") return "Ανεβαίνει μόνο το προσωρινό αρχείο ήχου.";
  if (phase === "queued") return "Το αρχείο είναι ασφαλές και περιμένει τον worker.";
  if (phase === "processing") return `WhisperX · ${stage || "επεξεργασία"}`;
  if (phase === "ready") return "Το WordTimeline και το ProsodyMap είναι έτοιμα.";
  return "Ο ήχος διαγράφεται μόλις ολοκληρωθεί ή αποτύχει οριστικά η εργασία.";
}

export default function AudioTimingCapturePanel({
  videoId,
  playerReady,
  getPlayer,
}: {
  videoId: string;
  playerReady: boolean;
  getPlayer: () => AudioTimingPlayer | null;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<TimingJob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<number | null>(null);
  const abortedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;
    const check = () => void fetch("/api/admin-auth", { cache: "no-store", credentials: "same-origin" })
      .then(async response => response.ok ? response.json() as Promise<{ authorized?: boolean }> : null)
      .then(result => { if (active) setAuthorized(Boolean(result?.authorized)); })
      .catch(() => undefined);
    check();
    window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, [videoId]);

  const releaseCapture = useCallback(async () => {
    if (monitorRef.current !== null) window.clearInterval(monitorRef.current);
    monitorRef.current = null;
    displayStreamRef.current?.getTracks().forEach(track => track.stop());
    displayStreamRef.current = null;
    recorderRef.current = null;
    try { await wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  }, []);

  useEffect(() => () => { void releaseCapture(); }, [releaseCapture]);

  useEffect(() => {
    if (!job?.jobId || (phase !== "queued" && phase !== "processing")) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/audio-timing?job=${encodeURIComponent(job.jobId)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = await response.json() as { job?: TimingJob | null; artifact?: { proofReady?: boolean } | null; error?: string };
        if (!response.ok) throw new Error(result.error || "Δεν φορτώθηκε η κατάσταση του worker.");
        if (!active || !result.job) return;
        setJob(result.job);
        if (result.job.status === "ready" && result.artifact?.proofReady) setPhase("ready");
        else if (result.job.status === "ready" && result.artifact) {
          setMessage("Το audio artifact δημιουργήθηκε αλλά το τελικό SRT αποκλείστηκε από το quality gate. Δες το audit πριν γίνει οποιαδήποτε αλλαγή.");
          setPhase("error");
        }
        else if (result.job.status === "failed") {
          setMessage(result.job.errorMessage || "Η επεξεργασία απέτυχε.");
          setPhase("error");
        } else setPhase(result.job.status === "processing" ? "processing" : "queued");
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Δεν φορτώθηκε η κατάσταση του worker.");
          setPhase("error");
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [job?.jobId, phase]);

  const queueBlob = useCallback(async (blob: Blob) => {
    setPhase("uploading");
    setUploadProgress(0);
    const pathname = `audio-timing-inputs/v1/${videoId}/${Date.now()}.webm`;
    const uploaded = await upload(pathname, blob, {
      access: "public",
      handleUploadUrl: "/api/audio-timing/upload",
      clientPayload: JSON.stringify({ videoId }),
      contentType: blob.type || "audio/webm",
      onUploadProgress: event => setUploadProgress(Math.round(event.percentage)),
    });
    const response = await fetch("/api/audio-timing", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        media: {
          url: uploaded.url,
          pathname: uploaded.pathname,
          contentType: blob.type || uploaded.contentType || "audio/webm",
          size: blob.size,
        },
      }),
    });
    const result = await response.json() as { job?: TimingJob | null; artifact?: { proofReady?: boolean } | null; error?: string };
    if (!response.ok) throw new Error(result.error || "Δεν δημιουργήθηκε η εργασία WhisperX.");
    if (result.artifact && !result.job) {
      if (result.artifact.proofReady) setPhase("ready");
      else {
        setMessage("Το υπάρχον audio artifact δεν πέρασε το v8.1 quality gate.");
        setPhase("error");
      }
      return;
    }
    if (!result.job) throw new Error("Δεν επιστράφηκε έγκυρη εργασία WhisperX.");
    setJob(result.job);
    setPhase(result.job.status === "processing" ? "processing" : "queued");
  }, [videoId]);

  const beginCapture = useCallback(async () => {
    const player = getPlayer();
    if (!playerReady || !player) {
      setMessage("Περίμενε να φορτώσει πλήρως το βίντεο.");
      setPhase("error");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setMessage("Η καταγραφή ήχου καρτέλας χρειάζεται Chrome ή Edge.");
      setPhase("error");
      return;
    }
    abortedRef.current = false;
    setMessage("");
    setJob(null);
    setElapsed(0);
    setUploadProgress(0);
    player.pauseVideo();
    player.setPlaybackRate(1);
    player.seekTo(0, true);
    setDuration(player.getDuration());
    setPhase("permission");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
        systemAudio: "exclude",
      } as DisplayMediaStreamOptions);
      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        displayStream.getTracks().forEach(track => track.stop());
        throw new Error("Δεν κοινοποιήθηκε ήχος. Επίλεξε «Αυτή η καρτέλα» και ενεργοποίησε «Κοινή χρήση ήχου καρτέλας».");
      }
      displayStreamRef.current = displayStream;
      const audioStream = new MediaStream(audioTracks);
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(audioStream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      });
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void releaseCapture().then(async () => {
          if (abortedRef.current) {
            setPhase("idle");
            return;
          }
          if (blob.size < 1_024) throw new Error("Η καταγραφή ήχου είναι κενή.");
          await queueBlob(blob);
        }).catch(error => {
          setMessage(error instanceof Error ? error.message : "Η αποστολή του ήχου απέτυχε.");
          setPhase("error");
        });
      }, { once: true });
      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") {
          abortedRef.current = true;
          recorder.stop();
          player.pauseVideo();
          setMessage("Η κοινή χρήση της καρτέλας σταμάτησε πριν ολοκληρωθεί το βίντεο.");
          setPhase("error");
        }
      }, { once: true });
      try {
        const wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen");
        wakeLockRef.current = wakeLock || null;
      } catch {}
      recorder.start(1_000);
      recorder.pause();
      setPhase("recording");
      player.playVideo();
      monitorRef.current = window.setInterval(() => {
        const state = player.getPlayerState();
        const current = player.getCurrentTime();
        const total = player.getDuration() || duration;
        setElapsed(Number.isFinite(current) ? current : 0);
        if (total > 0) setDuration(total);
        if (player.getPlaybackRate() !== 1) player.setPlaybackRate(1);
        if (state === YOUTUBE_PLAYING && recorder.state === "paused") recorder.resume();
        if (state !== YOUTUBE_PLAYING && recorder.state === "recording") recorder.pause();
        if ((state === YOUTUBE_ENDED || (total > 0 && current >= total - 0.2)) && recorder.state !== "inactive") {
          recorder.stop();
          player.pauseVideo();
        }
      }, 100);
    } catch (error) {
      await releaseCapture();
      setMessage(error instanceof Error ? error.message : "Δεν ξεκίνησε η καταγραφή ήχου.");
      setPhase("error");
    }
  }, [duration, getPlayer, playerReady, queueBlob, releaseCapture]);

  const abortCapture = useCallback(() => {
    abortedRef.current = true;
    getPlayer()?.pauseVideo();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else void releaseCapture();
    setMessage("Η καταγραφή ακυρώθηκε και δεν ανέβηκε αρχείο.");
  }, [getPlayer, releaseCapture]);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginBusy) return;
    const password = String(new FormData(event.currentTarget).get("password") || "");
    if (!password) return;
    setLoginBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { authorized?: boolean; error?: string };
      if (!response.ok || !result.authorized) throw new Error(result.error || "Ο κωδικός δεν είναι σωστός.");
      setAuthorized(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ολοκληρώθηκε η σύνδεση owner.");
    } finally {
      setLoginBusy(false);
    }
  }

  if (!authorized) return <section className="audio-proof-panel audio-proof-login">
    <div className="audio-proof-copy">
      <span className="audio-proof-kicker"><i/> V8.1 AUDIO PROOF · OWNER</span>
      <h2>Ξεκλείδωμα πραγματικού proof</h2>
      <p>Η καταγραφή ήχου είναι διαθέσιμη μόνο στον owner.</p>
    </div>
    <form onSubmit={unlock}>
      <input name="password" type="password" autoComplete="current-password" aria-label="Κωδικός owner" placeholder="Κωδικός owner"/>
      <button type="submit" disabled={loginBusy}>{loginBusy ? "Έλεγχος…" : "Ξεκλείδωμα"}</button>
    </form>
    {message && <p className="audio-proof-message" role="alert">{message}</p>}
  </section>;
  const active = phase === "permission" || phase === "recording" || phase === "uploading" || phase === "queued" || phase === "processing";
  const progress = phase === "recording" && duration > 0
    ? Math.min(100, (elapsed / duration) * 100)
    : phase === "uploading" ? uploadProgress : job?.progress || 0;

  return <section className="audio-proof-panel" aria-live="polite">
    <div className="audio-proof-copy">
      <span className="audio-proof-kicker"><i/> V8.1 AUDIO PROOF · OWNER</span>
      <h2>Πραγματικός συγχρονισμός ήχου</h2>
      <p>{phaseLabel(phase, job?.stage || "")}</p>
    </div>
    <div className="audio-proof-status">
      <div className="audio-proof-progress"><i style={{ width: `${progress}%` }}/></div>
      <span>{phase === "recording" ? `${clock(elapsed)} / ${clock(duration)}` : phase === "uploading" ? `${uploadProgress}%` : active ? `${job?.progress || 0}%` : phase === "ready" ? "Έτοιμο" : "Αναμονή"}</span>
    </div>
    {message && <p className="audio-proof-message" role="alert">{message}</p>}
    <div className="audio-proof-actions">
      {!active && phase !== "ready" && <button type="button" onClick={() => void beginCapture()} disabled={!playerReady}>Έναρξη καταγραφής</button>}
      {(phase === "permission" || phase === "recording") && <button type="button" className="secondary" onClick={abortCapture}>Ακύρωση</button>}
      {phase === "ready" && <><a href={`/?proof=alignment-v8-1-full&video=${videoId}`}>Άνοιγμα v8.1 proof</a><a className="secondary" href={`/api/audio-timing?video=${videoId}&download=srt`}>Λήψη SRT</a></>}
      {phase === "error" && <button type="button" className="secondary" onClick={() => { setMessage(""); setPhase("idle"); }}>Καθαρισμός</button>}
    </div>
    {phase === "idle" && <small>Chrome ή Edge · Αυτή η καρτέλα · Κοινή χρήση ήχου καρτέλας · 1×</small>}
  </section>;
}
