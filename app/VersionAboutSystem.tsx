"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { APP_VERSION } from "./version";

type PortalTargets = {
  mobileMenu: Element | null;
  footer: Element | null;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AppMark() {
  return (
    <span className="version-about-mark" aria-hidden="true">
      <span>▶</span>
    </span>
  );
}

export default function VersionAboutSystem() {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<PortalTargets>({ mobileMenu: null, footer: null });

  useEffect(() => {
    const refreshTargets = () => {
      const mobileMenu = document.querySelector(".mobile-menu");
      const footer = document.querySelector(".app-footer");
      setTargets(current => current.mobileMenu === mobileMenu && current.footer === footer
        ? current
        : { mobileMenu, footer });
    };

    refreshTargets();
    const observer = new MutationObserver(refreshTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const openFromVersion = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const version = target.closest(".brand-version");
      if (!version) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    };

    document.addEventListener("click", openFromVersion, true);
    return () => document.removeEventListener("click", openFromVersion, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const modal = open ? createPortal(
    <div className="version-about-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="version-about-card" role="dialog" aria-modal="true" aria-labelledby="version-about-title">
        <header className="version-about-topline">
          <span className="version-about-pill"><i />VERSION {APP_VERSION}</span>
          <button type="button" className="version-about-close" aria-label="Κλείσιμο" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </header>

        <div className="version-about-identity">
          <AppMark />
          <div>
            <h2 id="version-about-title">GreekTube Subs</h2>
            <p>YouTube με ελληνικούς υπότιτλους</p>
          </div>
          <span className="version-about-current">v{APP_VERSION}</span>
        </div>

        <div className="version-about-section">
          <span className="version-about-kicker">ΤΙ ΜΠΟΡΕΙΣ ΝΑ ΚΑΝΕΙΣ</span>
          <div className="version-about-capabilities">
            <article>
              <i />
              <div><strong>Ελληνικοί υπότιτλοι</strong><p>Δες αγγλικά YouTube videos με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους.</p></div>
            </article>
            <article>
              <i />
              <div><strong>Συγχρονισμένη μεταγραφή</strong><p>Διάβασε το περιεχόμενο και πήγαινε αμέσως στο σημείο του βίντεο που σε ενδιαφέρει.</p></div>
            </article>
            <article>
              <i />
              <div><strong>Προσωπική βιβλιοθήκη</strong><p>Κράτησε τα videos σου, τα αγαπημένα σου και την πρόοδο προβολής σε ένα μέρος.</p></div>
            </article>
            <article>
              <i />
              <div><strong>Στιγμές και γρήγορη πλοήγηση</strong><p>Αποθήκευσε σημαντικά σημεία και επέστρεψε σε αυτά με ένα πάτημα.</p></div>
            </article>
          </div>
        </div>

        <div className="version-about-description">
          <span className="version-about-kicker">ΣΧΕΤΙΚΑ ΜΕ ΤΟ GREEKTUBE SUBS</span>
          <p>Το GreekTube Subs μετατρέπει δημόσια YouTube videos σε μια πιο εύχρηστη εμπειρία για ελληνόφωνους θεατές. Προσφέρει ελληνικούς υπότιτλους, συγχρονισμένη μεταγραφή, προσωπική βιβλιοθήκη και εργαλεία για να βρίσκεις και να κρατάς εύκολα τα σημαντικά σημεία κάθε βίντεο.</p>
        </div>

        <footer className="version-about-footer">
          <span>greektubesubs.com</span>
          <small>GreekTube Subs · v{APP_VERSION}</small>
        </footer>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {targets.mobileMenu && createPortal(
        <button type="button" className="mobile-version-label" onClick={() => setOpen(true)}>
          <span><i />VERSION</span><strong>{APP_VERSION}</strong>
        </button>,
        targets.mobileMenu,
      )}

      {targets.footer && createPortal(
        <button type="button" className="footer-version-label" onClick={() => setOpen(true)}>
          Version {APP_VERSION}
        </button>,
        targets.footer,
      )}

      {modal}

      <style>{`
        .brand-version{
          cursor:pointer;
          transition:border-color .16s ease,background .16s ease,color .16s ease,box-shadow .16s ease;
        }
        .brand-version:hover{
          border-color:rgba(143,127,240,.42)!important;
          background:rgba(143,127,240,.09)!important;
          color:#d7d1ff!important;
          box-shadow:0 0 0 3px rgba(143,127,240,.045);
        }

        .mobile-version-label{
          width:100%;
          min-height:38px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          margin-top:4px;
          padding:0 12px;
          border:1px solid rgba(143,127,240,.14);
          border-radius:10px;
          background:rgba(143,127,240,.055);
          color:#898f9c;
          font-size:9px;
          letter-spacing:.08em;
          text-transform:uppercase;
        }
        .mobile-version-label span{display:flex;align-items:center;gap:7px;font-weight:650}
        .mobile-version-label span i{width:5px;height:5px;border-radius:50%;background:#9183ee;box-shadow:0 0 9px rgba(145,131,238,.42)}
        .mobile-version-label strong{color:#b7b0e8;font-family:var(--font-geist-mono),monospace;font-size:9px;font-weight:600;letter-spacing:.02em}
        .mobile-version-label:active{background:rgba(143,127,240,.1)}

        .footer-version-label{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:28px;
          margin-top:6px;
          padding:0 10px;
          border:1px solid var(--line);
          border-radius:999px;
          background:transparent;
          color:var(--soft);
          font-family:var(--font-geist-mono),monospace;
          font-size:8px;
          letter-spacing:.025em;
          transition:border-color .16s ease,color .16s ease,background .16s ease;
        }
        .footer-version-label:hover{border-color:rgba(143,127,240,.35);background:rgba(143,127,240,.06);color:#aaa1ef}

        .version-about-backdrop{
          position:fixed;
          inset:0;
          z-index:9999;
          display:grid;
          place-items:center;
          padding:22px;
          background:rgba(5,6,10,.76);
          backdrop-filter:blur(16px) saturate(.9);
          -webkit-backdrop-filter:blur(16px) saturate(.9);
          animation:versionBackdropIn .18s ease both;
        }
        .version-about-card{
          width:min(472px,100%);
          max-height:min(760px,calc(100vh - 44px));
          overflow:auto;
          padding:17px;
          border:1px solid rgba(111,82,241,.82);
          border-radius:20px;
          background:
            radial-gradient(circle at 12% 4%,rgba(203,191,255,.9),transparent 31%),
            radial-gradient(circle at 86% 18%,rgba(206,232,240,.8),transparent 38%),
            linear-gradient(145deg,#e5e4ee 0%,#dce3e9 48%,#d0d3d8 100%);
          color:#171921;
          box-shadow:0 32px 90px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.62);
          animation:versionCardIn .22s cubic-bezier(.2,.8,.2,1) both;
        }
        .version-about-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:17px}
        .version-about-pill{
          min-height:25px;
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:0 10px;
          border-radius:999px;
          background:#19182a;
          color:#f1efff;
          font-family:var(--font-geist-mono),monospace;
          font-size:8px;
          font-weight:650;
          letter-spacing:.075em;
        }
        .version-about-pill i{width:5px;height:5px;border-radius:50%;background:#b9aeff;box-shadow:0 0 10px rgba(185,174,255,.68)}
        .version-about-close{
          width:34px;
          height:34px;
          display:grid;
          place-items:center;
          padding:0;
          border:1px solid rgba(29,30,38,.13);
          border-radius:11px;
          background:rgba(255,255,255,.34);
          color:#343640;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.5);
        }
        .version-about-close svg{width:18px;height:18px}
        .version-about-close:hover{background:rgba(255,255,255,.55);color:#11131a}

        .version-about-identity{
          display:grid;
          grid-template-columns:39px minmax(0,1fr) auto;
          gap:11px;
          align-items:center;
          padding:11px 12px;
          border:1px solid rgba(23,25,33,.12);
          border-radius:15px;
          background:rgba(255,255,255,.23);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.38);
        }
        .version-about-mark{
          width:36px;
          height:36px;
          display:grid;
          place-items:center;
          border-radius:50%;
          background:linear-gradient(145deg,#202339,#121420);
          color:#c9c2ff;
          box-shadow:0 7px 17px rgba(48,42,83,.16),inset 0 1px 0 rgba(255,255,255,.08);
        }
        .version-about-mark span{font-size:12px;transform:translateX(1px)}
        .version-about-identity h2{margin:0;font-size:14px;font-weight:720;letter-spacing:-.025em}
        .version-about-identity p{margin:3px 0 0;color:#656977;font-size:10px;line-height:1.3}
        .version-about-current{padding:5px 7px;border-radius:8px;background:rgba(34,35,49,.07);color:#545768;font-family:var(--font-geist-mono),monospace;font-size:8px;font-weight:650}

        .version-about-section{margin-top:22px}
        .version-about-kicker{display:block;margin-bottom:10px;color:#5f6070;font-size:8px;font-weight:760;letter-spacing:.115em}
        .version-about-capabilities{display:grid;gap:3px}
        .version-about-capabilities article{display:grid;grid-template-columns:11px 1fr;gap:8px;padding:8px 5px;border-radius:10px}
        .version-about-capabilities article:hover{background:rgba(255,255,255,.18)}
        .version-about-capabilities article>i{width:5px;height:5px;margin-top:6px;border-radius:50%;background:#6958d4;box-shadow:0 0 0 3px rgba(105,88,212,.09)}
        .version-about-capabilities strong{display:block;font-size:11.5px;font-weight:720;line-height:1.35}
        .version-about-capabilities p{margin:2px 0 0;color:#545864;font-size:10px;line-height:1.47}

        .version-about-description{
          margin-top:17px;
          padding:14px 14px 13px;
          border:1px solid rgba(23,25,33,.09);
          border-radius:14px;
          background:rgba(255,255,255,.18);
        }
        .version-about-description .version-about-kicker{margin-bottom:7px}
        .version-about-description p{margin:0;color:#3f424c;font-size:10.5px;line-height:1.62}
        .version-about-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:0 2px;color:#6b6d76}
        .version-about-footer span{font-size:9px;font-weight:700}
        .version-about-footer small{font-family:var(--font-geist-mono),monospace;font-size:8px}

        @keyframes versionBackdropIn{from{opacity:0}to{opacity:1}}
        @keyframes versionCardIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}

        @media(max-width:620px){
          .footer-version-label{font-size:9px;min-height:30px;margin-top:7px}
          .version-about-backdrop{align-items:end;padding:12px}
          .version-about-card{width:100%;max-height:calc(100dvh - 24px);padding:15px;border-radius:20px}
          .version-about-topline{margin-bottom:14px}
          .version-about-identity{grid-template-columns:38px minmax(0,1fr) auto;padding:11px}
          .version-about-section{margin-top:19px}
          .version-about-capabilities article{padding:7px 4px}
          .version-about-capabilities strong{font-size:11.5px}
          .version-about-capabilities p{font-size:10px;line-height:1.43}
          .version-about-description{margin-top:14px}
          .version-about-footer{padding-bottom:max(2px,env(safe-area-inset-bottom))}
        }

        @media(prefers-reduced-motion:reduce){
          .version-about-backdrop,.version-about-card{animation:none}
        }
      `}</style>
    </>
  );
}
