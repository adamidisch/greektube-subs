"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type LogoStyle = "official" | "classic" | "reverse" | "wordmark";

const STORAGE_KEY = "greektube-logo-style:v1";
const LOGO_STYLES: readonly LogoStyle[] = ["official", "classic", "reverse", "wordmark"];

const OPTIONS: ReadonlyArray<{
  id: LogoStyle;
  title: string;
  detail: string;
  src?: string;
}> = [
  { id: "official", title: "Επίσημο", detail: "Bubble · subtitles + play", src: "/gtslogo.svg" },
  { id: "classic", title: "Classic", detail: "Γραμμές → play", src: "/gtslogo-classic.svg" },
  { id: "reverse", title: "Alternate", detail: "Play → γραμμές", src: "/gtslogo-reverse.svg" },
  { id: "wordmark", title: "Μόνο κείμενο", detail: "Minimal GreekTube Subs" },
];

function isLogoStyle(value: string | null): value is LogoStyle {
  return Boolean(value && LOGO_STYLES.includes(value as LogoStyle));
}

export default function LogoPreferenceSystem() {
  const [logoStyle, setLogoStyle] = useState<LogoStyle>("official");
  const [settingsGrid, setSettingsGrid] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    const next = isLogoStyle(saved) ? saved : "official";
    setLogoStyle(next);
    document.documentElement.dataset.gtsLogo = next;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.gtsLogo = logoStyle;
    try {
      localStorage.setItem(STORAGE_KEY, logoStyle);
    } catch {}
  }, [logoStyle]);

  useEffect(() => {
    let appRoot: Element | null = null;
    let appObserver: MutationObserver | null = null;

    const syncSettingsTarget = () => {
      const next = document.querySelector<HTMLElement>(".settings-grid");
      setSettingsGrid(current => current === next ? current : next);
    };

    const attachToAppRoot = () => {
      const nextRoot = document.querySelector("main.app-shell");
      if (nextRoot !== appRoot) {
        appObserver?.disconnect();
        appRoot = nextRoot;
        if (appRoot) {
          appObserver = new MutationObserver(syncSettingsTarget);
          appObserver.observe(appRoot, { childList: true });
        }
      }
      syncSettingsTarget();
    };

    attachToAppRoot();
    const bodyObserver = new MutationObserver(attachToAppRoot);
    bodyObserver.observe(document.body, { childList: true });

    return () => {
      appObserver?.disconnect();
      bodyObserver.disconnect();
    };
  }, []);

  const settingsPanel = settingsGrid ? createPortal(
    <section className="logo-preference-panel" aria-labelledby="logo-preference-title">
      <div className="logo-preference-heading">
        <div>
          <h2 id="logo-preference-title">Λογότυπο</h2>
          <p>Διάλεξε την εμφάνιση του GreekTube Subs σε αυτή τη συσκευή.</p>
        </div>
        <span>LIVE</span>
      </div>
      <div className="logo-preference-options" role="radiogroup" aria-label="Επιλογή λογοτύπου">
        {OPTIONS.map(option => {
          const active = option.id === logoStyle;
          return (
            <button
              type="button"
              key={option.id}
              className={`logo-preference-option ${active ? "active" : ""}`}
              role="radio"
              aria-checked={active}
              onClick={() => setLogoStyle(option.id)}
            >
              <span className="logo-preference-preview" aria-hidden="true">
                {option.src ? <img src={option.src} alt="" /> : <strong>GreekTube <b>Subs</b></strong>}
              </span>
              <span className="logo-preference-copy">
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
              <i aria-hidden="true">{active ? "✓" : ""}</i>
            </button>
          );
        })}
      </div>
    </section>,
    settingsGrid,
  ) : null;

  return (
    <>
      {settingsPanel}
      <style>{`
        html[data-gts-logo="official"] body .app-shell.app-shell.app-shell .brand-mark,
        html[data-gts-logo="official"] body .viewer.viewer.viewer .brand-mark{
          display:block!important;
          background:transparent url("/gtslogo.svg") center/contain no-repeat!important;
        }
        html[data-gts-logo="classic"] body .app-shell.app-shell.app-shell .brand-mark,
        html[data-gts-logo="classic"] body .viewer.viewer.viewer .brand-mark{
          display:block!important;
          background:transparent url("/gtslogo-classic.svg") center/contain no-repeat!important;
        }
        html[data-gts-logo="reverse"] body .app-shell.app-shell.app-shell .brand-mark,
        html[data-gts-logo="reverse"] body .viewer.viewer.viewer .brand-mark{
          display:block!important;
          background:transparent url("/gtslogo-reverse.svg") center/contain no-repeat!important;
        }
        html[data-gts-logo="wordmark"] body .app-shell.app-shell.app-shell .brand-mark,
        html[data-gts-logo="wordmark"] body .viewer.viewer.viewer .brand-mark{
          display:none!important;
          width:0!important;
          height:0!important;
          flex:0 0 0!important;
        }

        .logo-preference-panel{
          min-width:0;
        }
        .logo-preference-heading{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          margin-bottom:15px;
        }
        .logo-preference-heading h2{
          margin:0!important;
        }
        .logo-preference-heading p{
          max-width:310px;
          margin:5px 0 0;
          color:var(--muted);
          font-size:10px;
          line-height:1.5;
        }
        .logo-preference-heading>span{
          min-height:20px;
          display:inline-flex;
          align-items:center;
          padding:0 7px;
          border:1px solid rgba(143,127,240,.24);
          border-radius:999px;
          background:rgba(143,127,240,.08);
          color:#aaa1ef;
          font-size:7px;
          font-weight:750;
          letter-spacing:.09em;
        }
        .logo-preference-options{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:8px;
        }
        .logo-preference-option{
          min-width:0;
          min-height:76px;
          display:grid;
          grid-template-columns:50px minmax(0,1fr) 18px;
          gap:9px;
          align-items:center;
          padding:10px;
          border:1px solid var(--line);
          border-radius:12px;
          background:var(--raised);
          color:var(--text);
          text-align:left;
          transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease;
        }
        .logo-preference-option:hover{
          transform:translateY(-1px);
          border-color:rgba(143,127,240,.32);
          background:rgba(143,127,240,.07);
        }
        .logo-preference-option.active{
          border-color:rgba(143,127,240,.58);
          background:linear-gradient(145deg,rgba(143,127,240,.14),rgba(143,127,240,.055));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 9px 24px rgba(70,58,145,.09);
        }
        .logo-preference-preview{
          width:50px;
          height:42px;
          display:grid;
          place-items:center;
          overflow:hidden;
          border:1px solid rgba(255,255,255,.07);
          border-radius:10px;
          background:#0b0d12;
        }
        .logo-preference-preview img{
          width:40px;
          height:32px;
          display:block;
        }
        .logo-preference-preview>strong{
          padding:0 5px;
          color:#f4f5f6;
          font-size:8px;
          font-weight:650;
          letter-spacing:-.02em;
          white-space:nowrap;
        }
        .logo-preference-preview>strong b{
          color:#9b8ef8;
          font-weight:620;
        }
        .logo-preference-copy{
          min-width:0;
          display:block;
        }
        .logo-preference-copy>strong{
          display:block;
          overflow:hidden;
          color:var(--text);
          font-size:10.5px;
          font-weight:650;
          line-height:1.25;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .logo-preference-copy>small{
          display:block;
          margin-top:4px;
          overflow:hidden;
          color:var(--soft);
          font-size:8px;
          line-height:1.25;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .logo-preference-option>i{
          width:17px;
          height:17px;
          display:grid;
          place-items:center;
          border:1px solid var(--line);
          border-radius:50%;
          color:transparent;
          font-size:9px;
          font-style:normal;
        }
        .logo-preference-option.active>i{
          border-color:rgba(143,127,240,.62);
          background:#7468d7;
          color:#fff;
        }
        html[data-theme="light"] .logo-preference-preview{
          border-color:rgba(70,55,35,.10);
          background:#171922;
        }
        html[data-theme="light"] .logo-preference-option.active{
          background:#f0ecff;
        }
        @media(max-width:620px){
          .logo-preference-heading p{font-size:11px}
          .logo-preference-options{grid-template-columns:1fr}
          .logo-preference-option{min-height:70px;grid-template-columns:54px minmax(0,1fr) 20px;padding:9px 10px}
          .logo-preference-preview{width:54px;height:44px}
          .logo-preference-copy>strong{font-size:11.5px}
          .logo-preference-copy>small{font-size:9px}
        }
      `}</style>
    </>
  );
}
