"use client";

import { useRef, useState } from "react";

type Props = {
  videoId: string;
  onPublished: () => void;
};

type ApiResult = {
  error?: string;
  sourceCueCount?: number;
  manifest?: { revision?: number; status?: string };
};

export default function OwnerSourceImportPanel({ videoId, onPublished }: Props) {
  const sourceInput = useRef<HTMLInputElement>(null);
  const greekInput = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [greekFile, setGreekFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = Boolean(sourceFile && greekFile && !busy);

  async function importRevision() {
    if (!sourceFile || !greekFile || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const [sourceSubtitleText, subtitleText] = await Promise.all([
        sourceFile.text(),
        greekFile.text(),
      ]);
      const response = await fetch("/api/owner-translation/source-import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, sourceSubtitleText, subtitleText }),
      });
      const result = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(result.error || "Η εισαγωγή απέτυχε.");
      const revision = result.manifest?.revision ? " r" + result.manifest.revision : "";
      setMessage("Η νέα source revision" + revision + " δημοσιεύτηκε με " + (result.sourceCueCount ?? "όλα τα") + " cues.");
      onPublished();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η εισαγωγή απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sourceImport">
      <div>
        <p className="eyebrow">Safe source revision</p>
        <h3>Αντικατάσταση source με ελεγμένα SRT</h3>
        <p>Ανεβάζει μαζί το canonical αγγλικό source και το αντίστοιχο ελληνικό SRT. Η δημοσίευση μπλοκάρεται αν διαφέρει έστω ένα timestamp.</p>
      </div>
      <div className="fileRow">
        <input ref={sourceInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} />
        <button type="button" className="secondary" onClick={() => sourceInput.current?.click()}>
          {sourceFile ? "Αγγλικό: " + sourceFile.name : "Επιλογή αγγλικού SRT"}
        </button>
        <input ref={greekInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={(event) => setGreekFile(event.target.files?.[0] ?? null)} />
        <button type="button" className="secondary" onClick={() => greekInput.current?.click()}>
          {greekFile ? "Ελληνικό: " + greekFile.name : "Επιλογή ελληνικού SRT"}
        </button>
      </div>
      <button type="button" className="publish" disabled={!ready} onClick={importRevision}>
        {busy ? "Γίνεται έλεγχος και δημοσίευση…" : "Έλεγχος και δημοσίευση νέου source"}
      </button>
      {message ? <p className="result" role="status">{message}</p> : null}
      <style jsx>{`
        .sourceImport{margin:18px 0;padding:18px;border:1px solid rgba(244,178,82,.36);border-radius:16px;background:linear-gradient(135deg,rgba(244,178,82,.1),rgba(20,20,24,.22));display:grid;gap:12px}
        .sourceImport h3{margin:2px 0 6px;font-size:16px}.sourceImport p{margin:0;color:#c8c7cc;line-height:1.45}.eyebrow{color:#f4b252!important;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:700}.fileRow{display:flex;gap:8px;flex-wrap:wrap}.secondary,.publish{border:0;border-radius:10px;padding:10px 12px;font:inherit;font-weight:700;cursor:pointer}.secondary{background:#2a2930;color:#f5f4f6}.publish{background:#f4b252;color:#1b1409;justify-self:start}.publish:disabled{opacity:.45;cursor:not-allowed}.result{color:#f7d79c!important;font-weight:600}
      `}</style>
    </section>
  );
}
