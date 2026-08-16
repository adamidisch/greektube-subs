"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ThemeMode = "dark" | "light" | "system";
type PersonalState = { settings?: { theme?: ThemeMode } } & Record<string, unknown>;

const PERSONAL_CACHE_KEY = "greektube-personal-state:v1";
const QUICK_THEME_KEY = "greektube-quick-theme:v1";

function currentTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
}

function readCachedState(): PersonalState | null {
  try {
    const raw = localStorage.getItem(PERSONAL_CACHE_KEY);
    return raw ? JSON.parse(raw) as PersonalState : null;
  } catch {
    return null;
  }
}

async function loadState(): Promise<PersonalState | null> {
  const cached = readCachedState();
  if (cached) return cached;
  try {
    const response = await fetch("/api/state", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as PersonalState;
  } catch {
    return null;
  }
}

async function persistTheme(theme: "dark" | "light") {
  try { localStorage.setItem(QUICK_THEME_KEY, theme); } catch {}
  const base = await loadState();
  if (!base) return;
  const next: PersonalState = {
    ...base,
    settings: { ...(base.settings || {}), theme },
  };
  try { localStorage.setItem(PERSONAL_CACHE_KEY, JSON.stringify(next)); } catch {}
  try {
    await fetch("/api/state", {
      method: "PUT",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-GreekTube-Shared-Write": "0",
      },
      body: JSON.stringify(next),
    });
  } catch {}
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  return theme === "dark" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.75v2.1M12 19.15v2.1M4.22 4.22l1.49 1.49M18.29 18.29l1.49 1.49M2.75 12h2.1M19.15 12h2.1M4.22 19.78l1.49-1.49M18.29 5.71l1.49-1.49" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.1 15.38A8.5 8.5 0 0 1 8.62 3.9 8.5 8.5 0 1 0 20.1 15.38Z" />
    </svg>
  );
}

export default function ThemeToggleEnhancer() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const syncHeader = () => setHeader(document.querySelector<HTMLElement>(".app-header"));
    syncHeader();
    const observer = new MutationObserver(syncHeader);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      const stored = localStorage.getItem(QUICK_THEME_KEY);
      const actual = currentTheme();
      if ((stored === "dark" || stored === "light") && actual !== stored) {
        applyTheme(stored);
        setTheme(stored);
        return;
      }
      setTheme(actual);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncSettingsSelect = () => {
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".settings-page select"));
      const themeSelect = selects.find(select => {
        const values = Array.from(select.options).map(option => option.value);
        return values.includes("dark") && values.includes("light") && values.includes("system");
      });
      if (!themeSelect) return;
      const stored = localStorage.getItem(QUICK_THEME_KEY);
      if ((stored === "dark" || stored === "light") && themeSelect.value !== stored) {
        themeSelect.value = stored;
        themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    syncSettingsSelect();
    const observer = new MutationObserver(syncSettingsSelect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onSettingsChange = (event: Event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.closest(".settings-page")) return;
      const values = Array.from(select.options).map(option => option.value);
      if (!values.includes("dark") || !values.includes("light") || !values.includes("system")) return;
      if (select.value === "dark" || select.value === "light") {
        try { localStorage.setItem(QUICK_THEME_KEY, select.value); } catch {}
      } else {
        try { localStorage.removeItem(QUICK_THEME_KEY); } catch {}
      }
    };
    document.addEventListener("change", onSettingsChange, true);
    return () => document.removeEventListener("change", onSettingsChange, true);
  }, []);

  const label = useMemo(
    () => theme === "dark" ? "Ενεργοποίηση φωτεινού θέματος" : "Ενεργοποίηση σκούρου θέματος",
    [theme],
  );

  if (!header) return null;
  return (
    <>
      {createPortal(
        <button
          type="button"
          className="theme-quick-toggle"
          aria-label={label}
          title={label}
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            applyTheme(next);
            void persistTheme(next);
          }}
        >
          <ThemeIcon theme={theme} />
        </button>,
        header,
      )}
      <style>{`
        /* Canonical viewer-header action zone.
           These selectors intentionally outrank the legacy brand.css !important rules. */
        html body .app-shell.app-shell.app-shell.viewer > .app-header {
          position: relative !important;
          display: grid !important;
          grid-template-columns: minmax(0,auto) minmax(0,1fr) 94px !important;
          column-gap: 10px !important;
          align-items: center !important;
          padding-right: 0 !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .brand {
          position: static !important;
          left: auto !important;
          top: auto !important;
          transform: none !important;
          grid-column: 2 !important;
          justify-self: center !important;
          margin: 0 !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .back-library,
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .back-to-video {
          grid-column: 1 !important;
          justify-self: start !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .theme-quick-toggle,
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .icon-button[aria-label="Ρυθμίσεις"] {
          position: absolute !important;
          top: 50% !important;
          width: 38px !important;
          height: 38px !important;
          min-width: 38px !important;
          min-height: 38px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: inline-grid !important;
          place-items: center !important;
          z-index: 8 !important;
          transform: translateY(-50%) !important;
          grid-column: auto !important;
          justify-self: auto !important;
          border-radius: 11px !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .theme-quick-toggle {
          right: 46px !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .icon-button[aria-label="Ρυθμίσεις"] {
          right: 0 !important;
        }
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .theme-quick-toggle svg,
        html body .app-shell.app-shell.app-shell.viewer > .app-header > .icon-button[aria-label="Ρυθμίσεις"] svg {
          width: 17px !important;
          height: 17px !important;
          display: block !important;
        }
        @media (max-width: 620px) {
          html body .app-shell.app-shell.app-shell.viewer > .app-header {
            grid-template-columns: minmax(0,auto) minmax(0,1fr) 94px !important;
          }
        }
      `}</style>
    </>
  );
}
