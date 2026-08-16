"use client";

import { useEffect } from "react";

type CaptionSpeaker = { name?: string; role?: string };
type CaptionPayload = { speaker?: CaptionSpeaker };

const CURATED_SPEAKERS: Record<string, string> = {
  BbGv7GTbRN8: "Dr. Stasha Gominak",
  ATKu1Cxs2Pc: "Dr. Philip Ovadia",
  NqLpQhii_fU: "Dr. Sarah Myhill",
  KkBy__7d9Fs: "Dr. Sarah Myhill",
  "0_adZSC0sFI": "Dr. Sarah Myhill",
  D2RjneeG_xA: "Dr. Sarah Myhill",
  fX2z_BF8Jac: "Dr. Natasha Campbell-McBride",
  HDK3Y9mGMiA: "Dr. Natasha Campbell-McBride",
};

function settingsIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "17");
  svg.setAttribute("height", "17");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 13.5a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19.5a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3.5a2 2 0 110-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9.5a1.65 1.65 0 001-1.51V3.5a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9.5a1.65 1.65 0 001.51 1H20.5a2 2 0 110 4h-.09a1.65 1.65 0 00-1.01 1z"/>';
  return svg;
}

function pencilIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M17 3a2.83 2.83 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>';
  return svg;
}

function heartIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6a4.6 4.6 0 018.8-1.9 4.6 4.6 0 018.8 1.9z"/>';
  return svg;
}

function replaceIcon(button: HTMLButtonElement, kind: "settings" | "edit" | "favorite") {
  if (button.dataset.auditIcon === kind) return;
  button.replaceChildren(kind === "settings" ? settingsIcon() : kind === "edit" ? pencilIcon() : heartIcon());
  button.dataset.auditIcon = kind;
}

export default function PlayerUIAuditEnhancer() {
  useEffect(() => {
    let activeVideoId = "";
    let requestSerial = 0;

    const decorate = () => {
      document.querySelectorAll<HTMLButtonElement>('.viewer .icon-button[aria-label="Ρυθμίσεις"]').forEach(button => replaceIcon(button, "settings"));

      document.querySelectorAll<HTMLButtonElement>('.viewer .mobile-video-byline button[aria-label="Διαχείριση υποτίτλων"]').forEach(button => button.remove());
      document.querySelectorAll<HTMLButtonElement>('.viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"], .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]').forEach(button => replaceIcon(button, "edit"));
      document.querySelectorAll<HTMLButtonElement>('.viewer .mobile-video-byline button[aria-label="Αγαπημένο"], .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]').forEach(button => replaceIcon(button, "favorite"));

      const videoId = new URLSearchParams(location.search).get("video") || "";
      if (!videoId || videoId === activeVideoId) return;
      activeVideoId = videoId;
      const serial = ++requestSerial;

      const applySpeaker = (name: string) => {
        if (!name || serial !== requestSerial) return;
        document.querySelectorAll<HTMLElement>(".viewer .mobile-video-byline > strong").forEach(node => { node.textContent = name; });
        document.querySelectorAll<HTMLElement>(".viewer .mobile-watch-summary section > div > strong").forEach(node => { node.textContent = name; });
        document.querySelectorAll<HTMLElement>(".viewer .video-meta-kicker > strong").forEach(node => { node.textContent = name; });
        document.querySelectorAll<HTMLElement>(".viewer .cover-caption > small").forEach(node => { node.textContent = name; });
      };

      const curated = CURATED_SPEAKERS[videoId];
      if (curated) applySpeaker(curated);

      void fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store" })
        .then(async response => response.ok ? await response.json() as CaptionPayload : null)
        .then(payload => {
          const captionSpeaker = payload?.speaker?.name?.trim();
          if (captionSpeaker) applySpeaker(captionSpeaker);
          else if (curated) applySpeaker(curated);
        })
        .catch(() => { if (curated) applySpeaker(curated); });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", decorate);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", decorate);
    };
  }, []);

  return null;
}
