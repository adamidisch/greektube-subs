"use client";

import { useEffect, useRef, useState } from "react";
import GreekTubePlayer from "./GreekTubePlayer";
import {
  appRouteKey,
  parseAppRoute,
  readNavigationMarker,
  routeWithoutView,
  sameVideoContext,
  shouldBackOnVideoClose,
  shouldPromoteVideoReplaceToPush,
  withNavigationMarker,
  type AppRoute,
  type AppRouteKind,
  type NavigationMarker,
} from "./navigation-history";

const SETTINGS_SELECTOR = ".settings-page";
const SETTINGS_CLOSE_SELECTOR = ".settings-page .settings-close";
const EDITOR_SELECTOR = ".gts-editor-screen";
const EDITOR_CLOSE_SELECTOR = ".gts-editor-back,.gts-editor-auth-cancel";
const EDITOR_BUTTON_SELECTOR = 'button[aria-label="Επεξεργασία βίντεο"],button.card-edit';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const HOLD_SPEED_DELAY_MS = 420;
const HOLD_SPEED_MOVE_THRESHOLD_PX = 16;

function markerFor(route: AppRoute, inApp: boolean, direct: boolean): NavigationMarker {
  return { kind: route.kind, videoId: route.videoId, inApp, direct };
}

function videoIdFromEditButton(button: HTMLElement): string {
  const current = String(new URLSearchParams(location.search).get("video") || "").trim();
  if (VIDEO_ID_PATTERN.test(current) && button.closest(".viewer")) return current;
  const container = button.closest(".video-card,article") || button.parentElement;
  const image = container?.querySelector<HTMLImageElement>('img[src*="i.ytimg.com/vi/"]');
  return image?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1] || "";
}

function settingsButton(): HTMLButtonElement | null {
  const direct = document.querySelector<HTMLButtonElement>('button[aria-label="Ρυθμίσεις"]');
  if (direct) return direct;
  return [...document.querySelectorAll<HTMLButtonElement>(".mobile-menu > button")]
    .find(button => button.textContent?.trim() === "Ρυθμίσεις") || null;
}

function editorButton(videoId: string): HTMLButtonElement | null {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(EDITOR_BUTTON_SELECTOR)];
  if (!videoId) return buttons[0] || null;
  return buttons.find(button => videoIdFromEditButton(button) === videoId) || null;
}

function fullscreenVideoFrame(): HTMLElement | null {
  const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
  const nativeFullscreen = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement || null;
  if (nativeFullscreen instanceof HTMLElement && nativeFullscreen.classList.contains("video-frame")) return nativeFullscreen;
  return document.querySelector<HTMLElement>(".video-frame.pseudo-fullscreen");
}

function blocksFullscreenShortcutBridge(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
}

function videoTapButton(target: EventTarget | null): HTMLButtonElement | null {
  return target instanceof Element ? target.closest<HTMLButtonElement>(".video-tap-toggle") : null;
}

function playbackRateFromUi(): number {
  const value = Number(document.querySelector<HTMLSelectElement>(".gts31-speed select")?.value);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sendPlaybackRate(frame: HTMLElement, rate: number): void {
  const iframe = frame.querySelector<HTMLIFrameElement>("iframe");
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }), "*");
}

export default function NavigationAwareGreekTubePlayer() {
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const routeRef = useRef<AppRoute | null>(null);
  const replayingHistory = useRef(false);
  const syncSequence = useRef(0);
  const pendingEditorId = useRef("");
  const overlayBackPending = useRef(false);

  useEffect(() => {
    const historyObject = window.history;
    const originalReplaceState = historyObject.replaceState;
    const nativeReplaceState = originalReplaceState.bind(historyObject);
    const nativePushState = historyObject.pushState.bind(historyObject);
    let settingsWasOpen = Boolean(document.querySelector(SETTINGS_SELECTOR));
    let editorWasOpen = Boolean(document.querySelector(EDITOR_SELECTOR));

    const writeState = (
      mode: "replace" | "push",
      url: string | URL,
      route: AppRoute,
      inApp: boolean,
      direct: boolean,
      state: unknown = historyObject.state,
      title = "",
    ) => {
      const nextState = withNavigationMarker(state, markerFor(route, inApp, direct));
      if (mode === "push") nativePushState(nextState, title, url);
      else nativeReplaceState(nextState, title, url);
      routeRef.current = route;
    };

    const initialRoute = parseAppRoute(location.href);
    const initialMarker = readNavigationMarker(historyObject.state);
    writeState(
      "replace",
      location.href,
      initialRoute,
      initialMarker?.inApp === true,
      initialMarker ? initialMarker.direct : initialRoute.kind !== "home",
    );

    historyObject.replaceState = ((state: unknown, title: string, url?: string | URL | null) => {
      if (url === undefined || url === null) {
        nativeReplaceState(state, title, url);
        return;
      }

      const current = parseAppRoute(location.href);
      const nextUrl = new URL(String(url), location.href);
      const next = parseAppRoute(nextUrl);
      const currentMarker = readNavigationMarker(historyObject.state);

      // Editor/settings are overlays over the current video. Existing player code updates
      // the video URL while those overlays are open, so preserve the overlay route until
      // the overlay itself closes and Browser History returns to the previous entry.
      if ((current.kind === "editor" || current.kind === "settings")
        && next.kind === "video"
        && sameVideoContext(current, next)) {
        nextUrl.searchParams.set("view", current.kind);
        const overlayRoute = parseAppRoute(nextUrl);
        writeState(
          "replace",
          nextUrl,
          overlayRoute,
          currentMarker?.inApp === true,
          currentMarker?.direct === true,
          state,
          title,
        );
        return;
      }

      if (replayingHistory.current) {
        writeState(
          "replace",
          nextUrl,
          next,
          currentMarker?.inApp === true,
          currentMarker?.direct === true,
          state,
          title,
        );
        return;
      }

      if (shouldPromoteVideoReplaceToPush(current, next)) {
        writeState("push", nextUrl, next, true, false, state, title);
        return;
      }

      if (shouldBackOnVideoClose(current, next, currentMarker)) {
        queueMicrotask(() => historyObject.back());
        return;
      }

      writeState(
        "replace",
        nextUrl,
        next,
        currentMarker?.inApp === true,
        next.kind === "home" ? false : currentMarker?.direct === true,
        state,
        title,
      );
    }) as History["replaceState"];

    const pushOverlayRoute = (kind: Extract<AppRouteKind, "settings" | "editor">, videoId = "") => {
      const current = parseAppRoute(location.href);
      if (current.kind === kind) return;
      const url = new URL(location.href);
      url.searchParams.set("view", kind);
      if (videoId && !url.searchParams.get("video")) url.searchParams.set("video", videoId);
      const next = parseAppRoute(url);
      writeState("push", url, next, true, false);
    };

    const returnFromOverlay = () => {
      if (overlayBackPending.current) return;
      overlayBackPending.current = true;
      const marker = readNavigationMarker(historyObject.state);
      if (marker?.inApp) {
        historyObject.back();
        return;
      }
      const url = routeWithoutView(location.href, location.href);
      const route = parseAppRoute(url);
      writeState("replace", url, route, false, false);
      overlayBackPending.current = false;
    };

    const syncOverlayMutations = () => {
      const settingsOpen = Boolean(document.querySelector(SETTINGS_SELECTOR));
      const editorOpen = Boolean(document.querySelector(EDITOR_SELECTOR));

      if (!replayingHistory.current) {
        const route = routeRef.current || parseAppRoute(location.href);
        if (settingsOpen && !settingsWasOpen && route.kind !== "settings") {
          pushOverlayRoute("settings", route.videoId);
        } else if (!settingsOpen && settingsWasOpen && route.kind === "settings") {
          returnFromOverlay();
        }

        const currentRoute = routeRef.current || parseAppRoute(location.href);
        if (editorOpen && !editorWasOpen && currentRoute.kind !== "editor") {
          const id = pendingEditorId.current || currentRoute.videoId;
          pushOverlayRoute("editor", id);
        } else if (!editorOpen && editorWasOpen && currentRoute.kind === "editor") {
          returnFromOverlay();
        }
      }

      settingsWasOpen = settingsOpen;
      editorWasOpen = editorOpen;
    };

    const observer = new MutationObserver(syncOverlayMutations);
    observer.observe(document.body, { childList: true, subtree: true });

    const captureEditorTarget = (event: MouseEvent) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLElement>(EDITOR_BUTTON_SELECTOR)
        : null;
      if (!button) return;
      const id = videoIdFromEditButton(button);
      if (id) pendingEditorId.current = id;
    };
    document.addEventListener("click", captureEditorTarget, true);

    const restoreEditorShortcutFocus = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "range" || !target.closest(".gts-editor-timeline")) return;
      window.requestAnimationFrame(() => {
        if (document.activeElement === target) target.blur();
        document.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
      });
    };
    document.addEventListener("pointerup", restoreEditorShortcutFocus, true);
    document.addEventListener("pointercancel", restoreEditorShortcutFocus, true);

    // Mobile touch/pen hold mirrors the familiar temporary 2x gesture without changing
    // the saved speed. The YouTube iframe receives the temporary rate directly. Releasing,
    // cancelling, hiding the tab or losing focus always restores the exact UI-selected rate.
    let holdTimer: number | null = null;
    let holdPointerId: number | null = null;
    let holdStartX = 0;
    let holdStartY = 0;
    let holdFrame: HTMLElement | null = null;
    let holdPreviousRate = 1;
    let holdActive = false;
    let suppressHoldClick = false;
    let suppressHoldClickTimer: number | null = null;

    const removeHoldIndicator = () => {
      holdFrame?.querySelector(".gts-hold-speed-indicator")?.remove();
    };

    const clearHoldTimer = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = null;
    };

    const finishHoldSpeed = (suppressClick: boolean) => {
      clearHoldTimer();
      if (holdActive && holdFrame) sendPlaybackRate(holdFrame, holdPreviousRate);
      removeHoldIndicator();
      holdActive = false;
      holdPointerId = null;
      holdFrame = null;
      if (suppressHoldClickTimer !== null) window.clearTimeout(suppressHoldClickTimer);
      suppressHoldClick = suppressClick;
      suppressHoldClickTimer = suppressClick
        ? window.setTimeout(() => { suppressHoldClick = false; suppressHoldClickTimer = null; }, 600)
        : null;
    };

    const startHoldSpeed = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "mouse") return;
      const button = videoTapButton(event.target);
      const frame = button?.closest<HTMLElement>(".video-frame") || null;
      if (!button || !frame) return;

      finishHoldSpeed(false);
      holdPointerId = event.pointerId;
      holdStartX = event.clientX;
      holdStartY = event.clientY;
      holdFrame = frame;
      holdPreviousRate = playbackRateFromUi();
      holdTimer = window.setTimeout(() => {
        if (holdPointerId !== event.pointerId || !holdFrame) return;
        holdTimer = null;
        holdActive = true;
        suppressHoldClick = true;
        sendPlaybackRate(holdFrame, 2);
        const indicator = document.createElement("div");
        indicator.className = "gts-hold-speed-indicator";
        indicator.textContent = "2×";
        indicator.setAttribute("aria-hidden", "true");
        holdFrame.appendChild(indicator);
      }, HOLD_SPEED_DELAY_MS);
    };

    const moveHoldSpeed = (event: PointerEvent) => {
      if (holdPointerId !== event.pointerId || holdActive) return;
      const distance = Math.hypot(event.clientX - holdStartX, event.clientY - holdStartY);
      if (distance <= HOLD_SPEED_MOVE_THRESHOLD_PX) return;
      clearHoldTimer();
      holdPointerId = null;
      holdFrame = null;
    };

    const endHoldSpeed = (event: PointerEvent) => {
      if (holdPointerId !== event.pointerId) return;
      finishHoldSpeed(holdActive && event.type === "pointerup");
    };

    const suppressClickAfterHold = (event: MouseEvent) => {
      if (!suppressHoldClick || !videoTapButton(event.target)) return;
      suppressHoldClick = false;
      if (suppressHoldClickTimer !== null) window.clearTimeout(suppressHoldClickTimer);
      suppressHoldClickTimer = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const cancelHoldSpeed = () => finishHoldSpeed(false);
    const cancelHiddenHoldSpeed = () => { if (document.hidden) finishHoldSpeed(false); };

    document.addEventListener("pointerdown", startHoldSpeed, true);
    document.addEventListener("pointermove", moveHoldSpeed, true);
    document.addEventListener("pointerup", endHoldSpeed, true);
    document.addEventListener("pointercancel", endHoldSpeed, true);
    document.addEventListener("lostpointercapture", endHoldSpeed, true);
    document.addEventListener("click", suppressClickAfterHold, true);
    window.addEventListener("blur", cancelHoldSpeed);
    document.addEventListener("visibilitychange", cancelHiddenHoldSpeed);

    // Desktop native fullscreen can leave keyboard focus on fullscreen chrome instead of
    // the player surface. Re-dispatch only the seek arrows from the fullscreen frame so
    // the existing GreekTubePlayer keyboard implementation remains the single source of
    // truth for ±5 second seeking. Editable controls are deliberately excluded.
    const bridgedFullscreenKeys = new WeakSet<Event>();
    const bridgeFullscreenSeekKeys = (event: KeyboardEvent) => {
      if (bridgedFullscreenKeys.has(event)) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      if (blocksFullscreenShortcutBridge(event.target)) return;
      const frame = fullscreenVideoFrame() || document.querySelector<HTMLElement>(".video-frame");
      if (!frame) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const forwarded = new KeyboardEvent("keydown", {
        key: event.key,
        code: event.code,
        location: event.location,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      });
      bridgedFullscreenKeys.add(forwarded);
      frame.dispatchEvent(forwarded);
    };
    document.addEventListener("keydown", bridgeFullscreenSeekKeys, true);

    const finishReplay = (sequence: number) => {
      if (sequence !== syncSequence.current) return;
      window.requestAnimationFrame(() => {
        if (sequence !== syncSequence.current) return;
        replayingHistory.current = false;
        overlayBackPending.current = false;
        settingsWasOpen = Boolean(document.querySelector(SETTINGS_SELECTOR));
        editorWasOpen = Boolean(document.querySelector(EDITOR_SELECTOR));
      });
    };

    const syncUiToRoute = (route: AppRoute, sequence: number) => {
      let attempts = 0;
      let clicked = false;
      const attempt = () => {
        if (sequence !== syncSequence.current) return;
        attempts += 1;

        if (route.kind === "settings") {
          if (document.querySelector(SETTINGS_SELECTOR)) {
            finishReplay(sequence);
            return;
          }
          if (route.videoId && !document.querySelector(".viewer")) {
            if (attempts < 60) window.setTimeout(attempt, 100);
            else finishReplay(sequence);
            return;
          }
          const button = settingsButton();
          if (button && !clicked) {
            clicked = true;
            button.click();
          }
          if (attempts < 60) window.setTimeout(attempt, 100);
          else finishReplay(sequence);
          return;
        }

        if (route.kind === "editor") {
          if (document.querySelector(EDITOR_SELECTOR)) {
            finishReplay(sequence);
            return;
          }
          const button = editorButton(route.videoId);
          if (button && !clicked) {
            clicked = true;
            pendingEditorId.current = route.videoId || videoIdFromEditButton(button);
            button.click();
          }
          if (attempts < 80) window.setTimeout(attempt, 100);
          else finishReplay(sequence);
          return;
        }

        finishReplay(sequence);
      };
      attempt();
    };

    const closeOverlayForHistory = (selector: string, targetRoute: AppRoute, sequence: number) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      button?.click();
      window.setTimeout(() => {
        if (sequence !== syncSequence.current) return;
        const editorStillOpen = selector === EDITOR_CLOSE_SELECTOR && Boolean(document.querySelector(EDITOR_SELECTOR));
        if (editorStillOpen) {
          // Dirty editor close can be cancelled. Restore the history entry instead of
          // leaving the visible editor on a non-editor URL.
          replayingHistory.current = false;
          routeRef.current = parseAppRoute(location.href);
          historyObject.forward();
          return;
        }
        routeRef.current = parseAppRoute(location.href);
        syncUiToRoute(targetRoute, sequence);
      }, 0);
    };

    const onPopState = () => {
      const previous = routeRef.current || parseAppRoute(location.href);
      const next = parseAppRoute(location.href);
      routeRef.current = next;
      replayingHistory.current = true;
      overlayBackPending.current = false;
      const sequence = ++syncSequence.current;

      if (previous.kind === "editor" && next.kind !== "editor") {
        closeOverlayForHistory(EDITOR_CLOSE_SELECTOR, next, sequence);
        return;
      }
      if (previous.kind === "settings" && next.kind !== "settings") {
        closeOverlayForHistory(SETTINGS_CLOSE_SELECTOR, next, sequence);
        return;
      }

      const previousIsBase = previous.kind === "home" || previous.kind === "video";
      const nextIsBase = next.kind === "home" || next.kind === "video";
      if (previousIsBase && nextIsBase && appRouteKey(previous) !== appRouteKey(next)) {
        setNavigationEpoch(value => value + 1);
      }

      syncUiToRoute(next, sequence);
    };
    window.addEventListener("popstate", onPopState);

    const initialSequence = ++syncSequence.current;
    if (initialRoute.kind === "settings" || initialRoute.kind === "editor") {
      replayingHistory.current = true;
      syncUiToRoute(initialRoute, initialSequence);
    } else {
      finishReplay(initialSequence);
    }

    return () => {
      finishHoldSpeed(false);
      historyObject.replaceState = originalReplaceState;
      observer.disconnect();
      document.removeEventListener("click", captureEditorTarget, true);
      document.removeEventListener("pointerup", restoreEditorShortcutFocus, true);
      document.removeEventListener("pointercancel", restoreEditorShortcutFocus, true);
      document.removeEventListener("pointerdown", startHoldSpeed, true);
      document.removeEventListener("pointermove", moveHoldSpeed, true);
      document.removeEventListener("pointerup", endHoldSpeed, true);
      document.removeEventListener("pointercancel", endHoldSpeed, true);
      document.removeEventListener("lostpointercapture", endHoldSpeed, true);
      document.removeEventListener("click", suppressClickAfterHold, true);
      window.removeEventListener("blur", cancelHoldSpeed);
      document.removeEventListener("visibilitychange", cancelHiddenHoldSpeed);
      document.removeEventListener("keydown", bridgeFullscreenSeekKeys, true);
      window.removeEventListener("popstate", onPopState);
      syncSequence.current += 1;
    };
  }, []);

  return <>
    <GreekTubePlayer key={navigationEpoch} />
    <style>{`
      .video-tap-toggle {
        -webkit-touch-callout: none;
        user-select: none;
      }
      .gts-hold-speed-indicator {
        position: absolute;
        z-index: 1004;
        top: max(14px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: grid;
        place-items: center;
        min-width: 54px;
        height: 34px;
        padding: 0 13px;
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 999px;
        background: rgba(8,9,13,.78);
        color: #fff;
        font-size: 14px;
        font-weight: 750;
        letter-spacing: -.02em;
        line-height: 1;
        backdrop-filter: blur(10px);
        pointer-events: none;
      }
      .video-frame:not(:fullscreen):not(.pseudo-fullscreen) .gts-hold-speed-indicator {
        top: 12px;
        min-width: 48px;
        height: 30px;
        padding-inline: 11px;
        font-size: 13px;
      }
    `}</style>
  </>;
}
