"use client";

import type { CSSProperties, ReactNode } from "react";
import { setAppLanguage, tr, useAppLanguage, type AppLanguage } from "./app-language";
import type { Settings } from "./GreekTubePlayer";

/**
 * Settings (v7.28.0): grouped rows in the iOS / Android settings pattern — label on the left, a compact control on the
 * right, one colour per section (icon tile, switches, selected segment, slider). No full-width fields.
 * Every setting keeps its existing key and saves exactly as before.
 */
type Option<T> = { value: T; label: string };
type Tone = "blue" | "amber" | "indigo" | "sage";

const Icon = ({ children }: { children: ReactNode }) =>
  <span className="gs-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{children}</svg></span>;

const ICONS = {
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  subtitles: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 11h4M13 11h4M7 15h7" /></>,
  playback: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l5.5-3.5z" /></>,
  appearance: <><path d="M12 3a9 9 0 100 18c1.2 0 1.8-.7 1.8-1.6 0-.9-.6-1.3-.6-2.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 004-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.3" r="1" /><circle cx="14.5" cy="7.3" r="1" /></>,
};

export function SettingsPage({ settings, update, close, speeds }: {
  settings: Settings; update: (patch: Partial<Settings>) => void; close: () => void; speeds: readonly number[];
}) {
  const language = useAppLanguage();
  const transparency = Math.round((1 - settings.opacity) * 100);
  const frame = settings.subtitleFrame ?? "subtle";
  const blurAfterPointer = <T extends HTMLElement>(event: React.PointerEvent<T>) => event.currentTarget.blur();

  const section = (tone: Tone, icon: ReactNode, title: string, rows: ReactNode, extra?: ReactNode, className = "") =>
    <section className={`gs-section ${className}`} data-tone={tone} aria-label={title}>
      <header className="gs-section-head"><Icon>{icon}</Icon><h2>{title}</h2></header>
      {extra}
      <div className="gs-card">{rows}</div>
    </section>;

  const text = (label: string, hint?: string) =>
    <span className="gs-text"><span className="gs-label">{label}</span>{hint && <small>{hint}</small>}</span>;

  const toggle = (key: keyof Settings, label: string, hint?: string) =>
    <label className="gs-row" key={String(key)}>
      {text(label, hint)}
      <input className="gs-switch" type="checkbox" role="switch" checked={Boolean(settings[key])} aria-checked={Boolean(settings[key])}
        onPointerUp={blurAfterPointer} onChange={event => update({ [key]: event.target.checked } as Partial<Settings>)} />
    </label>;

  const segmented = <T extends string | number>(label: string, value: T, options: Option<T>[], onChange: (value: T) => void, hint?: string) =>
    <div className={`gs-row ${options.length > 2 || hint ? "gs-row-wide" : ""}`} key={label}>
      {text(label, hint)}
      <div className="gs-seg" role="radiogroup" aria-label={label}>
        {options.map(option => <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value}
          className={value === option.value ? "on" : ""} onPointerUp={blurAfterPointer} onClick={() => onChange(option.value)}>{option.label}</button>)}
      </div>
    </div>;

  const slider = (label: string, display: string, input: { min: number; max: number; step: number; value: number; onChange: (value: number) => void }, hint?: string) =>
    <label className="gs-row gs-row-slider" key={label}>
      <span className="gs-slider-head">{text(label, hint)}<output>{display}</output></span>
      <input type="range" min={input.min} max={input.max} step={input.step} value={input.value}
        style={{ "--gs-fill": `${((input.value - input.min) / (input.max - input.min)) * 100}%` } as CSSProperties}
        onPointerUp={blurAfterPointer} onChange={event => input.onChange(Number(event.target.value))} />
    </label>;

  const delay = `${settings.delay > 0 ? "+" : ""}${settings.delay.toFixed(1).replace(".", language === "en" ? "." : ",")} s`;

  const preview =
    <div className="gs-preview" data-position={settings.subtitlePosition} aria-hidden="true">
      <div className="gs-preview-scene" />
      {settings.subtitles
        ? <span className={`gs-preview-sub frame-${frame}`} style={{ fontSize: `${settings.subtitleSize}px`, background: `rgba(8,9,13,${settings.opacity})` }}>
            {tr("Έτσι θα φαίνονται οι υπότιτλοι.", "This is how subtitles will look.")}
          </span>
        : <span className="gs-preview-off">{tr("Οι υπότιτλοι είναι κλειστοί", "Subtitles are off")}</span>}
    </div>;

  return <section className="gs-page">
    <header className="gs-head">
      <div>
        <span className="gs-eyebrow">{tr("ΠΡΟΤΙΜΗΣΕΙΣ ΕΦΑΡΜΟΓΗΣ")}</span>
        <h1>{tr("Ρυθμίσεις")}</h1>
        <p>{tr("Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.")}</p>
      </div>
      <button type="button" className="gs-close" aria-label={tr("Κλείσιμο ρυθμίσεων")} onClick={close}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <div className="gs-columns">
      <div className="gs-column">
        {section("amber", ICONS.subtitles, tr("Υπότιτλοι"), <>
          {toggle("subtitles", tr("Εμφάνιση υποτίτλων"))}
          {segmented(tr("Γλώσσα υποτίτλων", "Subtitle language"), settings.subtitleMode, [
            { value: "el", label: tr("Ελληνικά") }, { value: "en", label: tr("Αγγλικά") }, { value: "dual", label: tr("Διπλοί", "Dual") }],
            value => update({ subtitleMode: value }))}
          {slider(tr("Μέγεθος γραμμάτων", "Text size"), `${settings.subtitleSize} px`,
            { min: 13, max: 28, step: 1, value: settings.subtitleSize, onChange: value => update({ subtitleSize: value, subtitleSizeVersion: 2 }) })}
          {segmented(tr("Θέση"), settings.subtitlePosition, [
            { value: "bottom", label: tr("Κάτω") }, { value: "top", label: tr("Πάνω") }], value => update({ subtitlePosition: value }))}
          {segmented(tr("Περίγραμμα", "Outline"), frame, [
            { value: "none", label: tr("Χωρίς", "None") }, { value: "subtle", label: tr("Διακριτικό", "Subtle") }, { value: "strong", label: tr("Εμφανές", "Visible") }],
            value => update({ subtitleFrame: value }))}
          {slider(tr("Διαφάνεια φόντου"), `${transparency}%`,
            { min: 0, max: 100, step: 5, value: transparency, onChange: value => update({ opacity: 1 - value / 100 }) })}
          {slider(tr("Καθυστέρηση υποτίτλων"), delay,
            { min: -5, max: 5, step: 0.1, value: settings.delay, onChange: value => update({ delay: Math.round(value * 10) / 10 }) },
            tr("Αν οι υπότιτλοι έρχονται νωρίς ή αργά.", "If subtitles come early or late."))}
          {toggle("autoScroll", tr("Αυτόματη κύλιση μεταγραφής"))}
          {toggle("highlight", tr("Επισήμανση ενεργής γραμμής"))}
        </>, preview, "gs-subtitles")}
      </div>

      <div className="gs-column">
        {section("blue", ICONS.language, tr("Γλώσσα", "Language"), <>
          {segmented(tr("Γλώσσα εφαρμογής"), language, [
            { value: "el" as AppLanguage, label: "Ελληνικά" }, { value: "en" as AppLanguage, label: "English" }],
            value => { setAppLanguage(value); update({ appLanguage: value }); },
            tr("Δεν αλλάζει τη γλώσσα των υποτίτλων.", "Does not change the subtitle language."))}
        </>, undefined, "gs-language")}

        {section("indigo", ICONS.playback, tr("Αναπαραγωγή"), <>
          {toggle("autoplay", tr("Αυτόματη αναπαραγωγή"))}
          {segmented(tr("Ταχύτητα"), settings.speed, speeds.map(speed => ({ value: speed, label: `${speed}×` })), value => update({ speed: value }))}
          {toggle("continueWatching", tr("Συνέχιση προβολής"), tr("Ξεκινά από εκεί που σταμάτησες.", "Resume where you left off."))}
          {toggle("autoTranslate", tr("Αυτόματη μετάφραση"))}
          {toggle("autoCategory", tr("Αυτόματη κατηγοριοποίηση"))}
        </>, undefined, "gs-playback")}

        {section("sage", ICONS.appearance, tr("Εμφάνιση"), <>
          {segmented(tr("Θέμα"), settings.theme, [
            { value: "dark", label: tr("Σκούρο") }, { value: "light", label: tr("Φωτεινό") }, { value: "system", label: tr("Σύστημα") }],
            value => update({ theme: value }))}
          {segmented(tr("Διάταξη βιβλιοθήκης"), settings.layout, [
            { value: "grid", label: tr("Πλέγμα") }, { value: "list", label: tr("Λίστα") }], value => update({ layout: value }))}
          {toggle("compact", tr("Συμπαγείς κάρτες"))}
          {toggle("descriptions", tr("Εμφάνιση περιγραφών"))}
        </>, undefined, "gs-appearance")}
      </div>
    </div>

    <footer className="gs-foot">
      <small><span className="gs-dot" aria-hidden="true" />{tr("Οι αλλαγές έχουν αποθηκευτεί.")}</small>
      <button type="button" onClick={close}>{tr("Κλείσιμο ρυθμίσεων")}</button>
    </footer>
  </section>;
}
