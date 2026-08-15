"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Theme = "light" | "dark";
type StoredState = {
  settings?: Record<string, unknown>;
  videos?: unknown[];
  moments?: unknown[];
};

const PERSONAL_CACHE_KEY = "greektube-personal-state:v1";
const SCROLL_RESTORE_KEY = "greektube-theme-scroll";

function SunIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.35 5.35l1.5 1.5M17.15 17.15l1.5 1.5M18.65 5.35l-1.5 1.5M6.85 17.15l-1.5 1.5"/></svg>;
}

function MoonIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.7 15.3A7.9 7.9 0 0 1 8.7 4.3 8.1 8.1 0 1 0 19.7 15.3Z"/></svg>;
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function cachedState(): StoredState | null {
  try {
    const raw = localStorage.getItem(PERSONAL_CACHE_KEY);
    return raw ? JSON.parse(raw) as StoredState : null;
  } catch {
    return null;
  }
}

export default function ThemeToggleEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const syncTarget = () => setTarget(document.querySelector<HTMLElement>("main.app-shell:not(.viewer) > header.app-header"));
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTheme(currentTheme());
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SCROLL_RESTORE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(SCROLL_RESTORE_KEY);
      const y = Number(raw);
      if (Number.isFinite(y)) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
    } catch {}
  }, []);

  async function toggleTheme() {
    if (busy) return;
    const previous = currentTheme();
    const next: Theme = previous === "light" ? "dark" : "light";
    setBusy(true);
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;

    try {
      let serverState: StoredState | null = null;
      try {
        const response = await fetch("/api/state", { credentials: "same-origin", cache: "no-store" });
        if (response.ok) {
          const data = await response.json() as { state?: StoredState | null };
          serverState = data.state || null;
        }
      } catch {}

      const base = serverState || cachedState() || { settings: {}, videos: [], moments: [] };
      const nextState: StoredState = {
        ...base,
        settings: { ...(base.settings || {}), theme: next },
        videos: Array.isArray(base.videos) ? base.videos : [],
        moments: Array.isArray(base.moments) ? base.moments : [],
      };
      localStorage.setItem(PERSONAL_CACHE_KEY, JSON.stringify(nextState));

      const save = await fetch("/api/state", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextState),
      });
      if (!save.ok) throw new Error("theme_save_failed");

      try { sessionStorage.setItem(SCROLL_RESTORE_KEY, String(window.scrollY)); } catch {}
      window.location.reload();
    } catch {
      document.documentElement.dataset.theme = previous;
      document.documentElement.style.colorScheme = previous;
      setTheme(previous);
      setBusy(false);
    }
  }

  if (!target) return null;

  return createPortal(
    <div className="theme-toggle-shell">
      <button
        type="button"
        className={`theme-switch ${theme}`}
        onClick={() => void toggleTheme()}
        disabled={busy}
        aria-label={theme === "light" ? "Εναλλαγή σε σκούρο θέμα" : "Εναλλαγή σε φωτεινό θέμα"}
        title={theme === "light" ? "Σκούρο θέμα" : "Φωτεινό θέμα"}
      >
        <span className="theme-switch-thumb" aria-hidden="true" />
        <span className="theme-switch-icon sun"><SunIcon /></span>
        <span className="theme-switch-icon moon"><MoonIcon /></span>
      </button>
    </div>,
    target,
  );
}
