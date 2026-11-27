"use client";

import { useEffect } from "react";
import { getAppLanguage, tr, useAppLanguage } from "./app-language";
import { TOOLTIP_TIPS } from "./tooltip-tips";

type Tip = { text: string; key: string };

// Κοινό tooltip για κάθε κουμπί/εικονίδιο. Εμφανίζεται μόνο σε συσκευές με hover (ποντίκι) και στην
// πλοήγηση με πληκτρολόγιο. Ένα στοιχείο εκτός ροής (position: fixed), άρα δεν μετακινεί τη διάταξη.
// Πηγή κειμένου, με σειρά προτεραιότητας: data-tip → λεξικό (tooltip-tips.ts) → title/aria-label σε
// κουμπιά που έχουν μόνο εικονίδιο. Κουμπιά με ορατό κείμενο χωρίς καταχώριση δεν παίρνουν tooltip.

const TARGET = 'button,[role="button"],[role="tab"],[role="menuitem"],[role="switch"],a[href],summary,[data-tip]';
const ID = "gt-tooltip";
const SHOW_DELAY = 450;
const HANDOFF_WINDOW = 350;
const GAP = 10;
const CARET_INSET = 14;
const EDGE = 8;
const MAX_TARGET_W = 340;
const MAX_TARGET_H = 140;
const MAX_LINE_H = 48;

const norm = (value: string) =>
  value.replace(/\s+/g, " ").replace(/\s*\([^)]*\)\s*$/, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim().toLowerCase();

let dictCache: { lang: string; map: Map<string, Tip> } | null = null;
function dictionary() {
  const lang = getAppLanguage();
  if (dictCache?.lang === lang) return dictCache.map;
  const map = new Map<string, Tip>();
  for (const [key, el, en, shortcut] of TOOLTIP_TIPS) {
    const tip: Tip = { text: lang === "en" ? en : el, key: shortcut || "" };
    map.set(norm(key), tip);
    map.set(norm(tr(key)), tip);
  }
  dictCache = { lang, map };
  return map;
}

function visibleText(root: Element) {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) { out += node.nodeValue || ""; return; }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "svg" || tag === "style" || tag === "script" || el.getAttribute("aria-hidden") === "true") return;
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out.replace(/\s+/g, " ").trim();
}

function stripNativeTitle(el: Element) {
  const title = el.getAttribute("title");
  if (title === null) return;
  if (title) el.setAttribute("data-tip-title", title);
  el.removeAttribute("title");
}

// Συντόμευση στο τέλος του κειμένου, π.χ. «Αποθήκευση στιγμής (M)», γίνεται πλήκτρο δίπλα στην ετικέτα.
function splitShortcut(value: string): Tip {
  const match = value.match(/^(.*?)\s*\(([^()]{1,12})\)\s*$/);
  return match && match[1] ? { text: match[1].trim(), key: match[2].trim() } : { text: value.trim(), key: "" };
}

function describe(el: Element): Tip | null {
  if (typeof location !== "undefined" && location.pathname.startsWith("/admin")) return null;
  if (el.closest("[data-notip],.video-tap-toggle,.player-cover")) return null;
  const explicit = el.getAttribute("data-tip");
  if (explicit) {
    const tip = splitShortcut(explicit);
    return { text: tip.text, key: el.getAttribute("data-tip-key") || tip.key };
  }
  const rect = el.getBoundingClientRect();
  // Μεγάλες περιοχές (κάρτες, επιφάνεια βίντεο) δεν παίρνουν tooltip· μια μακριά γραμμή συνδέσμου επιτρέπεται.
  if (rect.height > MAX_TARGET_H || (rect.width > MAX_TARGET_W && rect.height > MAX_LINE_H)) return null;
  const label = (el.getAttribute("aria-label") || "").trim();
  const title = (el.getAttribute("data-tip-title") || "").trim();
  const text = visibleText(el);
  const map = dictionary();
  const hit = map.get(norm(text)) || map.get(norm(label));
  if (hit) {
    const key = splitShortcut(label).key || hit.key;
    // Ετικέτα ίδια με το ορατό κείμενο του κουμπιού: το tooltip δεν προσθέτει τίποτα (εκτός αν έχει συντόμευση).
    if (!key && text && norm(hit.text) === norm(text)) return null;
    return { text: hit.text, key };
  }
  // Κουμπί με ορατό κείμενο και πιο περιγραφική ετικέτα (π.χ. «Υπότιτλοι» → «Επιλογές υποτίτλων»): το tooltip δείχνει την ετικέτα.
  if (label && text && norm(label) !== norm(text) && norm(label).length > norm(text).length) return splitShortcut(label);
  const iconOnly = text.replace(/[^\p{L}\p{N}]/gu, "").length <= 2;
  if (iconOnly) {
    // Το πιο περιγραφικό από title/aria-label.
    const best = title.length > label.length ? title : label || title;
    return best ? splitShortcut(best) : null;
  }
  if (title && norm(title) !== norm(text)) return splitShortcut(title);
  return null;
}

export default function TooltipLayer() {
  useAppLanguage();

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const node = document.createElement("div");
    node.id = ID;
    node.className = "gt-tooltip";
    node.setAttribute("role", "tooltip");
    node.dataset.state = "hide";

    const hostOf = () =>
      ((document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement) as HTMLElement | null) ||
      document.body;
    const attach = () => {
      const host = hostOf();
      if (node.parentElement !== host) host.appendChild(node);
    };
    attach();

    let current: Element | null = null;
    let shownTip: Tip | null = null;
    let shown = false;
    let showTimer = 0;
    let watchTimer = 0;
    let lastHidden = 0;
    let viaPointer = true;

    // Ετικέτα, προαιρετικό πλήκτρο συντόμευσης και βελάκι που δείχνει το κουμπί.
    const paint = (tip: Tip) => {
      node.textContent = "";
      const label = document.createElement("span");
      label.className = "gt-tooltip-text";
      label.textContent = tip.text;
      node.appendChild(label);
      if (tip.key) {
        const key = document.createElement("kbd");
        key.className = "gt-tooltip-key";
        key.textContent = tip.key;
        node.appendChild(key);
      }
      const caret = document.createElement("i");
      caret.className = "gt-tooltip-caret";
      caret.setAttribute("aria-hidden", "true");
      node.appendChild(caret);
      node.dataset.key = tip.key ? "1" : "0";
      shownTip = tip;
    };

    const place = (target: Element) => {
      const r = target.getBoundingClientRect();
      node.style.transform = "translate(0px,0px)";
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let side = "top";
      let top = r.top - h - GAP;
      if (top < EDGE) {
        side = "bottom";
        top = r.bottom + GAP;
        if (top + h > vh - EDGE) { top = Math.max(EDGE, vh - h - EDGE); side = "none"; }
      }
      const center = r.left + r.width / 2;
      const left = Math.max(EDGE, Math.min(center - w / 2, vw - w - EDGE));
      const caret = Math.max(CARET_INSET, Math.min(center - left, w - CARET_INSET));
      node.dataset.place = side;
      node.style.setProperty("--gt-caret-x", `${Math.round(caret)}px`);
      node.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
    };

    const hide = () => {
      window.clearTimeout(showTimer);
      window.clearInterval(watchTimer);
      if (shown) lastHidden = Date.now();
      shown = false;
      shownTip = null;
      node.dataset.state = "hide";
      if (current && current.getAttribute("aria-describedby") === ID) current.removeAttribute("aria-describedby");
      current = null;
    };

    const show = (target: Element, tip: Tip) => {
      attach();
      paint(tip);
      place(target);
      node.dataset.state = "show";
      target.setAttribute("aria-describedby", ID);
      shown = true;
      window.clearInterval(watchTimer);
      watchTimer = window.setInterval(() => {
        if (!current || !current.isConnected || (viaPointer && !current.matches(":hover"))) { hide(); return; }
        const next = describe(current);
        if (!next) { hide(); return; }
        if (!shownTip || next.text !== shownTip.text || next.key !== shownTip.key) { paint(next); place(current); }
      }, 300);
    };

    const open = (target: Element, immediate: boolean) => {
      try {
        stripNativeTitle(target);
        const tip = describe(target);
        if (!tip) { hide(); return; }
        hide();
        current = target;
        const delay = immediate || Date.now() - lastHidden < HANDOFF_WINDOW ? 0 : SHOW_DELAY;
        showTimer = window.setTimeout(() => {
          if (current !== target || !target.isConnected) return;
          const fresh = describe(target);
          if (fresh) show(target, fresh);
        }, delay);
      } catch {
        hide();
      }
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const hit = (event.target as Element | null)?.closest?.(TARGET) || null;
      if (hit === current) return;
      viaPointer = true;
      if (!hit) { hide(); return; }
      open(hit, false);
    };
    const onOut = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && !event.relatedTarget) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const hit = (event.target as Element | null)?.closest?.(TARGET) || null;
      if (!hit || !hit.matches(":focus-visible")) return;
      viaPointer = false;
      open(hit, true);
    };
    // Κρύβεται μόνο όταν κυλά κάτι που περιέχει το στοιχείο (ή η σελίδα)· η αυτόματη κύλιση της μεταγραφής
    // δεν πρέπει να κρύβει tooltip σε σταθερά κουμπιά δίπλα της.
    const onScroll = (event: Event) => {
      if (!current) return;
      const source = event.target;
      if (source === document || source === document.documentElement || (source instanceof Node && source.contains(current))) hide();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    const onFullscreen = () => { hide(); attach(); };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);

    return () => {
      hide();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      node.remove();
    };
  }, []);

  return null;
}
