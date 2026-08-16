"use client";

import { useEffect } from "react";

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
    let root: Element | null = null;
    let observer: MutationObserver | null = null;
    let raf = 0;

    const decorate = () => {
      raf = 0;
      const viewer = document.querySelector("main.app-shell.viewer");
      if (!viewer) return;
      viewer.querySelectorAll<HTMLButtonElement>('.icon-button[aria-label="Ρυθμίσεις"]').forEach(button => replaceIcon(button, "settings"));
      viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Επεξεργασία βίντεο"], .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]').forEach(button => replaceIcon(button, "edit"));
      viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Αγαπημένο"], .mobile-watch-summary button[aria-label="Αγαπημένο"]').forEach(button => replaceIcon(button, "favorite"));
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(decorate);
    };

    const attach = () => {
      const next = document.querySelector("main.app-shell.viewer");
      if (next === root) {
        schedule();
        return;
      }
      observer?.disconnect();
      root = next;
      if (root) {
        observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true });
      }
      schedule();
    };

    attach();
    const lifecycleObserver = new MutationObserver(attach);
    lifecycleObserver.observe(document.body, { childList: true });

    return () => {
      observer?.disconnect();
      lifecycleObserver.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
