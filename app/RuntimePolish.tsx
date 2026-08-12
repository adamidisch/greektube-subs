"use client";

import { useEffect, useState } from "react";

const RELEASE_VERSION = "7.6.0";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

export default function RuntimePolish() {
  const [checkingReady, setCheckingReady] = useState(false);

  useEffect(() => {
    const updateVersionLabels = () => {
      document.querySelectorAll<HTMLElement>(".brand-version").forEach((label) => {
        const text = `ver ${RELEASE_VERSION}`;
        if (label.textContent !== text) label.textContent = text;
      });
    };

    updateVersionLabels();
    const versionObserver = new MutationObserver(updateVersionLabels);
    versionObserver.observe(document.body, { childList: true, subtree: true });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let readinessCheck = false;
      try {
        const url = new URL(requestUrl(input), window.location.href);
        const activeVideoId = new URLSearchParams(window.location.search).get("video");
        const requestedVideoId = url.searchParams.get("videoId");
        readinessCheck =
          requestMethod(input, init) === "GET" &&
          url.pathname === "/api/captions" &&
          Boolean(requestedVideoId) &&
          requestedVideoId === activeVideoId &&
          !document.querySelector(".watch-layout") &&
          !document.querySelector(".content-loading");
      } catch {}

      if (readinessCheck) setCheckingReady(true);
      try {
        return await originalFetch(input, init);
      } finally {
        if (readinessCheck) {
          window.setTimeout(() => setCheckingReady(false), 140);
        }
      }
    };

    let volumeDragging = false;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const slider = target?.closest(".volume-popup input[type='range']") as HTMLInputElement | null;
      if (!slider) return;
      volumeDragging = true;
      try { slider.setPointerCapture(event.pointerId); } catch {}
    };
    const stopVolumeDrag = () => { volumeDragging = false; };
    const protectVolumePopup = (event: MouseEvent) => {
      if (!volumeDragging) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".volume-popup")) return;
      event.stopPropagation();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", stopVolumeDrag, true);
    document.addEventListener("pointercancel", stopVolumeDrag, true);
    document.addEventListener("mouseout", protectVolumePopup, true);

    return () => {
      window.fetch = originalFetch;
      versionObserver.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", stopVolumeDrag, true);
      document.removeEventListener("pointercancel", stopVolumeDrag, true);
      document.removeEventListener("mouseout", protectVolumePopup, true);
    };
  }, []);

  if (!checkingReady) return null;

  return (
    <div className="runtime-readiness-overlay" role="status" aria-live="polite" aria-label="Έλεγχος ελληνικών υποτίτλων">
      <span className="runtime-readiness-spinner" aria-hidden="true">
        <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" /></svg>
      </span>
      <span>ΕΛΕΓΧΟΣ ΕΛΛΗΝΙΚΩΝ ΥΠΟΤΙΤΛΩΝ</span>
    </div>
  );
}
