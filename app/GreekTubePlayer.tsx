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

type LibraryVideo = {
  number: string;
  id: string;
  url: string;
  title: string;
  description: string;
  featured?: boolean;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
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

const LIBRARY: LibraryVideo[] = [
  {
    number: "01",
    id: "ATKu1Cxs2Pc",
    url: "https://www.youtube.com/watch?v=ATKu1Cxs2Pc",
    title: "Heart Surgeon: The Biggest Risk Factor for Heart Disease",
    description:
      "Ο Dr. Philip Ovadia εξηγεί τη σχέση της αντίστασης στην ινσουλίνη με την καρδιακή νόσο και γιατί το LDL δεν δίνει μόνο του ολόκληρη την εικόνα.",
    featured: true,
  },
  {
    number: "02",
    id: "NqLpQhii_fU",
    url: "https://www.youtube.com/watch?v=NqLpQhii_fU",
    title: "If You Want to Cut Carbs, Watch This!",
    description:
      "Η Dr. Sarah Myhill αναλύει τι συμβαίνει στον οργανισμό όταν μειώνονται οι υδατάνθρακες και πώς αλλάζει η παραγωγή ενέργειας.",
  },
  {
    number: "03",
    id: "D7bBCcbAuYQ",
    url: "https://www.youtube.com/watch?v=D7bBCcbAuYQ",
    title: "The Hidden Cause of Stubborn Fat",
    description:
      "Μια συζήτηση για τους μεταβολικούς μηχανισμούς που μπορεί να δυσκολεύουν την απώλεια λίπους πέρα από την απλή μέτρηση θερμίδων.",
  },
  {
    number: "04",
    id: "fX2z-BF8Jac",
    url: "https://www.youtube.com/watch?v=fX2z-BF8Jac",
    title: "Let Food Be Thy Medicine",
    description:
      "Η Dr. Natasha Campbell-McBride εξετάζει τη σύνδεση της τροφής με το μικροβίωμα και τον ρόλο του εντέρου στη συνολική υγεία.",
  },
  {
    number: "05",
    id: "KkBy__7d9Fs",
    url: "https://www.youtube.com/watch?v=KkBy__7d9Fs",
    title: "Why Most People Are Insulin Resistant",
    description:
      "Η Dr. Sarah Myhill παρουσιάζει τη δική της εξήγηση για την αντίσταση στην ινσουλίνη και τους παράγοντες που την τροφοδοτούν.",
  },
  {
    number: "06",
    id: "0_adZSC0sFI",
    url: "https://www.youtube.com/watch?v=0_adZSC0sFI",
    title: "The Fastest Way to Get Rid of an Upper Fermenting Gut",
    description:
      "Πρακτική ανάλυση του upper fermenting gut με έμφαση στην πέψη στα συμπτώματα και στους μηχανισμούς πίσω από τη ζύμωση.",
  },
  {
    number: "07",
    id: "D2RjneeG_xA",
    url: "https://www.youtube.com/watch?v=D2RjneeG_xA",
    title: "The Easiest Way to Reverse Metabolic Issues",
    description:
      "Μια σύντομη προσέγγιση στα βασικά βήματα που μπορούν να βελτιώσουν τη μεταβολική λειτουργία και την καθημερινή ενέργεια.",
  },
];

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

function progressMessage(progress: number) {
  if (progress < 24) return "Εντοπίζω τα διαθέσιμα captions";
  if (progress < 54) return "Λαμβάνω το αγγλικό transcript";
  if (progress < 88) return "Μεταφράζω και συγχρονίζω στα ελληνικά";
  return "Ολοκληρώνω την προετοιμασία";
}

export default function GreekTubePlayer() {
  const [customUrl, setCustomUrl] = useState("");
  const [selected, setSelected] = useState<LibraryVideo | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [data, setData] = useState<CaptionResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeCue, setActiveCue] = useState(-1);
  const [subtitleSize, setSubtitleSize] = useState<"compact" | "normal" | "large">("normal");
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const activeText = activeCue >= 0 ? data?.cues[activeCue]?.text ?? "" : "";
  const transcript = useMemo(() => data?.cues ?? [], [data]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 92) return value;
        const step = value < 35 ? 4 : value < 70 ? 2 : 1;
        return Math.min(92, value + step);
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!videoId || !playerHostRef.current || status !== "ready") return;
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
            const disableYouTubeCaptions = () => {
              target.setOption?.("captions", "track", {});
              target.unloadModule?.("captions");
            };
            disableYouTubeCaptions();
            window.setTimeout(disableYouTubeCaptions, 600);
            window.setTimeout(disableYouTubeCaptions, 1600);
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
  }, [videoId, status]);

  useEffect(() => {
    if (!data || status !== "ready") return;
    const timer = window.setInterval(() => {
      const current = playerRef.current?.getCurrentTime();
      if (typeof current !== "number") return;
      setActiveCue(cueIndexAtTime(data.cues, current));
    }, 180);
    return () => window.clearInterval(timer);
  }, [data, status]);

  useEffect(() => {
    if (activeCue < 0 || !transcriptRef.current) return;
    transcriptRef.current
      .querySelector<HTMLElement>(`[data-cue="${activeCue}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCue]);

  async function prepareVideo(video: LibraryVideo) {
    const requestId = ++requestRef.current;
    playerRef.current?.destroy();
    playerRef.current = null;
    setSelected(video);
    setVideoId(null);
    setData(null);
    setActiveCue(-1);
    setStatus("loading");
    setProgress(7);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const response = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url }),
      });
      const payload = (await response.json()) as CaptionResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Δεν μπόρεσα να πάρω υπότιτλους.");
      if (requestId !== requestRef.current) return;
      setProgress(100);
      setData(payload);
      setVideoId(payload.videoId);
      setStatus("ready");
      setMessage(`${payload.cues.length.toLocaleString("el-GR")} ελληνικά segments`);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Κάτι πήγε λάθος.");
    }
  }

  function submitCustomVideo(event: FormEvent) {
    event.preventDefault();
    const id = extractVideoId(customUrl);
    if (!id) {
      setMessage("Βάλε ένα έγκυρο YouTube link.");
      return;
    }
    void prepareVideo({
      number: "NEW",
      id,
      url: customUrl.trim(),
      title: "Νέο YouTube video",
      description: "Προσωρινό video από το link που πρόσθεσες.",
    });
  }

  function closePlayer() {
    requestRef.current += 1;
    playerRef.current?.destroy();
    playerRef.current = null;
    setSelected(null);
    setVideoId(null);
    setData(null);
    setStatus("idle");
    setProgress(0);
    setMessage("");
    setActiveCue(-1);
  }

  function seekTo(cue: CaptionCue) {
    playerRef.current?.seekTo(cue.start, true);
    playerRef.current?.playVideo();
  }

  if (selected) {
    return (
      <main className="viewer-shell">
        <header className="viewer-topbar">
          <button className="back-button" type="button" onClick={closePlayer}>
            <span aria-hidden="true">←</span>
            Βιβλιοθήκη
          </button>
          <Link className="brand compact-brand" href="/" onClick={closePlayer}>
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>GreekTube</span>
            <span className="brand-accent">Subs</span>
          </Link>
          <div className="language-pill"><span className="live-dot" />EN → EL</div>
        </header>

        {status === "loading" && (
          <section className="preparing-view" aria-live="polite">
            <div className="preparing-thumbnail">
              {/* YouTube serves these thumbnails directly; dimensions prevent layout shift. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}
                alt=""
                width="480"
                height="360"
                decoding="async"
              />
              <div className="preparing-shade" />
              <div className="preparing-center">
                <span className="processing-ring" />
                <span className="progress-number">{progress}%</span>
              </div>
            </div>
            <div className="preparing-copy">
              <span className="video-number">{selected.number}</span>
              <h1>{selected.title}</h1>
              <p>{progressMessage(progress)}</p>
              <div className="progress-track" aria-label={`Πρόοδος ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>Το video θα ξεκινήσει αυτόματα μόλις ολοκληρωθούν οι ελληνικοί υπότιτλοι.</small>
            </div>
          </section>
        )}

        {status === "error" && (
          <section className="error-view">
            <span className="error-symbol">!</span>
            <h1>Δεν ολοκληρώθηκε η προετοιμασία</h1>
            <p>{message}</p>
            <button type="button" onClick={() => void prepareVideo(selected)}>Δοκίμασε ξανά</button>
          </section>
        )}

        {status === "ready" && data && (
          <section className="cinema-workspace" aria-live="polite">
            <div className="cinema-main">
              <div className="cinema-player">
                <div className="video-frame">
                  <div ref={playerHostRef} className="youtube-host" />
                  <div className={`subtitle-overlay subtitle-${subtitleSize}`} aria-live="off">
                    {activeText && <span>{activeText}</span>}
                  </div>
                </div>
                <div className="player-toolbar">
                  <div className="status-line status-ready">
                    <span className="status-icon">✓</span>
                    <span>{message} · Η μετάφραση ολοκληρώθηκε</span>
                  </div>
                  <div className="size-control" aria-label="Μέγεθος υποτίτλων">
                    <button onClick={() => setSubtitleSize("compact")} className={subtitleSize === "compact" ? "active" : ""}>A</button>
                    <button onClick={() => setSubtitleSize("normal")} className={subtitleSize === "normal" ? "active" : ""}>A</button>
                    <button onClick={() => setSubtitleSize("large")} className={subtitleSize === "large" ? "active" : ""}>A</button>
                  </div>
                </div>
              </div>
              <div className="cinema-meta">
                <span className="video-number">{selected.number}</span>
                <div>
                  <span className="meta-label">{data.channel}</span>
                  <h1>{data.title}</h1>
                </div>
                <span className="verified-badge">Ελληνικοί υπότιτλοι</span>
              </div>
            </div>

            <aside className="transcript-card">
              <div className="transcript-header">
                <div>
                  <span className="eyebrow">Live transcript</span>
                  <h2>Ελληνικά</h2>
                </div>
                <span className="cue-count">{data.cues.length}</span>
              </div>
              <div className="transcript-list" ref={transcriptRef}>
                {transcript.map((cue, index) => (
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
      </main>
    );
  }

  return (
    <main className="library-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="GreekTube Subs αρχική">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>GreekTube</span>
          <span className="brand-accent">Subs</span>
        </Link>
        <div className="header-actions">
          <span className="library-count">{LIBRARY.length} videos</span>
          <div className="language-pill"><span className="live-dot" />EN → EL</div>
        </div>
      </header>

      <section className="library-intro">
        <div>
          <span className="eyebrow">Επιλεγμένη video library</span>
          <h1>Δες τα στα ελληνικά.</h1>
          <p>Επίλεξε ένα video. Οι αγγλικοί υπότιτλοι μεταφράζονται και συγχρονίζονται αυτόματα πριν ξεκινήσει.</p>
        </div>
        <form className="compact-url-form" onSubmit={submitCustomVideo}>
          <label className="sr-only" htmlFor="youtube-url">YouTube link</label>
          <div className="url-field">
            <span aria-hidden="true">↗</span>
            <input
              id="youtube-url"
              inputMode="url"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              placeholder="Ή επικόλλησε άλλο YouTube link"
              autoComplete="off"
            />
          </div>
          <button className="primary-button" type="submit">Προετοιμασία</button>
        </form>
      </section>

      <section className="video-grid" aria-label="Video library">
        {LIBRARY.map((video) => (
          <button
            className={`video-card ${video.featured ? "featured" : ""}`}
            type="button"
            key={video.id}
            onClick={() => void prepareVideo(video)}
            aria-label={`Άνοιγμα video ${video.number}: ${video.title}`}
          >
            <span className="thumbnail-wrap">
              {/* YouTube serves these thumbnails directly; dimensions prevent layout shift. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                alt=""
                width="480"
                height="360"
                loading={video.featured ? "eager" : "lazy"}
                decoding="async"
              />
              <span className="thumbnail-gradient" />
              <span className="card-play"><span /></span>
              {video.featured && <span className="featured-label">Featured</span>}
            </span>
            <span className="card-content">
              <span className="video-number">{video.number}</span>
              <span className="card-copy">
                <strong>{video.title}</strong>
                <span>{video.description}</span>
              </span>
              <span className="card-arrow" aria-hidden="true">↗</span>
            </span>
          </button>
        ))}
      </section>

      <footer>
        <span>GreekTube Subs</span>
        <span>Αγγλικά captions · Ελληνική μετάφραση · Ακριβής συγχρονισμός</span>
      </footer>
    </main>
  );
}
