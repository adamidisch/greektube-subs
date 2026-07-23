"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type CaptionCue = {
  start: number;
  duration: number;
  text: string;
};

type CaptionResponse = {
  videoId: string;
  title: string;
  channel: string;
  sourceLanguage: string;
  sourceType: "manual" | "automatic";
  translationMethod: string;
  cues: CaptionCue[];
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  unloadModule?: (module: string) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width: string;
          height: string;
          playerVars: Record<string, number | string>;
          events: {
            onReady: (event: { target: YouTubePlayer }) => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SAMPLE_URL = "https://www.youtube.com/watch?v=ATKu1Cxs2Pc";

function extractVideoId(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{6,20}$/.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cueIndexAtTime(cues: CaptionCue[], time: number) {
  let low = 0;
  let high = cues.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start <= time) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (result < 0) return -1;
  const cue = cues[result];
  return time <= cue.start + Math.max(cue.duration, 2.4) ? result : -1;
}

export default function GreekTubePlayer() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [data, setData] = useState<CaptionResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [activeCue, setActiveCue] = useState(-1);
  const [subtitleSize, setSubtitleSize] = useState<"compact" | "normal" | "large">("normal");
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const activeText = activeCue >= 0 ? data?.cues[activeCue]?.text ?? "" : "";

  useEffect(() => {
    if (!videoId || !playerHostRef.current) return;
    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !window.YT || !playerHostRef.current) return;
      playerRef.current?.destroy();
      playerHostRef.current.innerHTML = "";
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          cc_load_policy: 0,
          cc_lang_pref: "el",
          hl: "el",
        },
        events: {
          onReady: ({ target }) => {
            target.unloadModule?.("captions");
            target.playVideo();
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      const current = playerRef.current?.getCurrentTime();
      if (typeof current !== "number") return;
      setActiveCue(cueIndexAtTime(data.cues, current));
    }, 180);
    return () => window.clearInterval(timer);
  }, [data]);

  useEffect(() => {
    if (activeCue < 0 || !transcriptRef.current) return;
    transcriptRef.current
      .querySelector<HTMLElement>(`[data-cue="${activeCue}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCue]);

  async function loadVideo(event: FormEvent) {
    event.preventDefault();
    const resolvedId = extractVideoId(url);
    if (!resolvedId) {
      setStatus("error");
      setMessage("Βάλε ένα έγκυρο YouTube link.");
      return;
    }

    setVideoId(resolvedId);
    setData(null);
    setActiveCue(-1);
    setStatus("loading");
    setMessage("Παίρνω τα αγγλικά captions και τα μεταφράζω στα ελληνικά…");
    window.localStorage.setItem("greektube:last-url", url.trim());

    try {
      const response = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const payload = (await response.json()) as CaptionResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Δεν μπόρεσα να πάρω υπότιτλους.");
      setData(payload);
      setStatus("ready");
      setMessage(
        `${payload.cues.length.toLocaleString("el-GR")} ελληνικά segments · Η μετάφραση ολοκληρώθηκε`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Κάτι πήγε λάθος.");
    }
  }

  function seekTo(cue: CaptionCue) {
    playerRef.current?.seekTo(cue.start, true);
    playerRef.current?.playVideo();
  }

  const transcript = useMemo(() => data?.cues ?? [], [data]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="GreekTube Subs αρχική">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>GreekTube</span>
          <span className="brand-accent">Subs</span>
        </Link>
        <div className="language-pill">
          <span className="live-dot" />
          EN → EL
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">YouTube με ελληνικούς υπότιτλους</div>
        <h1>Βάλε το link.<br />Παίζει στα ελληνικά.</h1>
        <p>
          Αυτόματη μετάφραση των αγγλικών captions με ακριβή συγχρονισμό στο video.
        </p>

        <form className="url-form" onSubmit={loadVideo}>
          <label className="sr-only" htmlFor="youtube-url">YouTube link</label>
          <div className="url-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.6 13.4a4.8 4.8 0 0 0 6.8 0l2-2a4.8 4.8 0 0 0-6.8-6.8l-1.1 1.1M13.4 10.6a4.8 4.8 0 0 0-6.8 0l-2 2a4.8 4.8 0 0 0 6.8 6.8l1.1-1.1" />
            </svg>
            <input
              id="youtube-url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Επικόλλησε YouTube link"
              autoComplete="off"
            />
            {url && (
              <button className="clear-button" type="button" onClick={() => setUrl("")} aria-label="Καθαρισμός">
                ×
              </button>
            )}
          </div>
          <button className="primary-button" type="submit" disabled={status === "loading"}>
            {status === "loading" ? <span className="spinner" /> : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" /></svg>
            )}
            {status === "loading" ? "Ετοιμάζω…" : "Παίξε με ελληνικά"}
          </button>
        </form>

        <button
          className="sample-button"
          type="button"
          onClick={() => setUrl(SAMPLE_URL)}
        >
          Χρήση δοκιμαστικού video
          <span>↗</span>
        </button>
      </section>

      {videoId && (
        <section className="workspace" aria-live="polite">
          <div className="video-column">
            <div className="player-card">
              <div className="video-frame">
                <div ref={playerHostRef} className="youtube-host" />
                <div className={`subtitle-overlay subtitle-${subtitleSize}`} aria-live="off">
                  {activeText && <span>{activeText}</span>}
                </div>
              </div>

              <div className="player-toolbar">
                <div className={`status-line status-${status}`}>
                  <span>{status === "loading" ? <span className="spinner small" /> : <span className="status-icon">✓</span>}</span>
                  <span>{message}</span>
                </div>
                <div className="size-control" aria-label="Μέγεθος υποτίτλων">
                  <button onClick={() => setSubtitleSize("compact")} className={subtitleSize === "compact" ? "active" : ""}>A</button>
                  <button onClick={() => setSubtitleSize("normal")} className={subtitleSize === "normal" ? "active" : ""}>A</button>
                  <button onClick={() => setSubtitleSize("large")} className={subtitleSize === "large" ? "active" : ""}>A</button>
                </div>
              </div>
            </div>

            {data && (
              <div className="video-meta">
                <div>
                  <div className="meta-label">{data.channel}</div>
                  <h2>{data.title}</h2>
                </div>
                <div className="verified-badge">Ελληνικοί υπότιτλοι</div>
              </div>
            )}
          </div>

          <aside className="transcript-card">
            <div className="transcript-header">
              <div>
                <span className="eyebrow">Live transcript</span>
                <h2>Ελληνικά</h2>
              </div>
              {data && <span className="cue-count">{data.cues.length}</span>}
            </div>

            <div className="transcript-list" ref={transcriptRef}>
              {status === "loading" && (
                <div className="transcript-loading">
                  <span className="loading-line wide" />
                  <span className="loading-line" />
                  <span className="loading-line wide" />
                  <span className="loading-line short" />
                </div>
              )}
              {status === "error" && (
                <div className="empty-state">
                  <strong>Δεν βρέθηκαν υπότιτλοι</strong>
                  <span>Δοκίμασε άλλο δημόσιο video με αγγλικά captions.</span>
                </div>
              )}
              {status === "ready" && transcript.map((cue, index) => (
                <button
                  type="button"
                  key={`${cue.start}-${index}`}
                  data-cue={index}
                  className={`cue-row ${index === activeCue ? "active" : ""}`}
                  onClick={() => seekTo(cue)}
                >
                  <span className="cue-time">{formatTime(cue.start)}</span>
                  <span className="cue-text">{cue.text}</span>
                </button>
              ))}
            </div>
          </aside>
        </section>
      )}

      {!videoId && (
        <section className="feature-strip" aria-label="Δυνατότητες">
          <div><span>01</span><strong>Αυτόματη λήψη</strong><small>Manual ή auto captions</small></div>
          <div><span>02</span><strong>Ελληνική μετάφραση</strong><small>Χωρίς αλλαγή του video</small></div>
          <div><span>03</span><strong>Ακριβής συγχρονισμός</strong><small>Κάθε γραμμή στο timestamp της</small></div>
        </section>
      )}

      <footer>
        <span>GreekTube Subs</span>
        <span>Για δημόσια YouTube videos με διαθέσιμα captions</span>
      </footer>
    </main>
  );
}
