"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useAppLanguage } from "./app-language";
import { MAX_OWNER_SRT_SIZE, prepareOwnerSourcePreview, type OwnerSourceCandidate } from "./owner-source-preview";
import type { SubtitleTrack } from "./subtitle-track";

type Props = {
  videoId: string;
  playedTrack: SubtitleTrack | null;
  onPreviewChange: (track: SubtitleTrack | null) => void;
  onPublished: () => void;
};

type ApiResult = {
  error?: string;
  sourceCueCount?: number;
  manifest?: { revision?: number };
};

export default function OwnerSourceImportPanel({ videoId, playedTrack, onPreviewChange, onPublished }: Props) {
  useAppLanguage();
  const sourceInput = useRef<HTMLInputElement>(null);
  const greekInput = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [greekFile, setGreekFile] = useState<File | null>(null);
  const [candidate, setCandidate] = useState<OwnerSourceCandidate | null>(null);
  const [busy, setBusy] = useState<"preview" | "publish" | null>(null);
  const [published, setPublished] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const played = Boolean(candidate && candidate.track === playedTrack);
  const canPublish = Boolean(candidate?.track.audit.readable && played && !busy && !published);

  useEffect(() => () => { previewRequest.current += 1; }, []);

  function clearPreview() {
    previewRequest.current += 1;
    setCandidate(null);
    setBusy(null);
    setPublished(false);
    setMessage(null);
    onPreviewChange(null);
  }

  async function startPreview() {
    if (!sourceFile || !greekFile || busy) return;
    clearPreview();
    const request = previewRequest.current;
    setBusy("preview");
    try {
      if (sourceFile.size > MAX_OWNER_SRT_SIZE || greekFile.size > MAX_OWNER_SRT_SIZE) {
        throw new Error(tr("Κάθε αρχείο SRT πρέπει να είναι έως 2 MB.", "Each SRT file must be 2 MB or smaller."));
      }
      const [sourceSubtitleText, subtitleText] = await Promise.all([sourceFile.text(), greekFile.text()]);
      if (request !== previewRequest.current) return;
      const next = prepareOwnerSourcePreview(sourceSubtitleText, subtitleText);
      if (next.error) {
        if (next.error === "number") {
          throw new Error(tr(`Οι αριθμοί διαφέρουν στον υπότιτλο ${next.cue}.`, `Numbers differ in subtitle ${next.cue}.`));
        }
        const errors = {
          size: tr("Κάθε αρχείο SRT πρέπει να είναι έως 2 MB.", "Each SRT file must be 2 MB or smaller."),
          english: tr("Το αγγλικό SRT δεν περιέχει έγκυρους υπότιτλους.", "The English SRT has no valid subtitles."),
          greek: tr("Το ελληνικό SRT δεν περιέχει έγκυρους ελληνικούς υπότιτλους.", "The Greek SRT has no valid Greek subtitles."),
          timing: tr("Τα SRT πρέπει να έχουν το ίδιο πλήθος υποτίτλων και ίδιους χρόνους.", "Both SRTs must have the same subtitle count and timings."),
        };
        throw new Error(errors[next.error]);
      }
      setCandidate(next);
      onPreviewChange(next.track);
    } catch (error) {
      if (request === previewRequest.current) setMessage(error instanceof Error ? error.message : tr("Δεν φορτώθηκε η προεπισκόπηση.", "Could not load the preview."));
    } finally {
      if (request === previewRequest.current) setBusy(null);
    }
  }

  async function importRevision() {
    if (!candidate || !canPublish) return;
    setBusy("publish");
    setMessage(null);
    try {
      const { sourceSubtitleText, subtitleText } = candidate;
      const response = await fetch("/api/owner-translation/source-import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, sourceSubtitleText, subtitleText }),
      });
      const result = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(result.error || tr("Η εισαγωγή απέτυχε.", "Import failed."));
      const count = result.sourceCueCount ?? candidate.sourceCueCount;
      setPublished(true);
      setMessage(tr(`Δημοσιεύτηκαν ${count} υπότιτλοι.`, `Published ${count} subtitles.`));
      onPublished();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("Η εισαγωγή απέτυχε.", "Import failed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sourceImport">
      <div>
        <h3>{tr("Αντικατάσταση υποτίτλων", "Replace subtitles")}</h3>
        <p>{tr("Επίλεξε τα δύο SRT και δοκίμασε την αναπαραγωγή πριν τα δημοσιεύσεις.", "Select both SRTs and check playback before publishing.")}</p>
      </div>
      <div className="fileRow">
        <input ref={sourceInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={event => {
          setSourceFile(event.target.files?.[0] ?? null);
          clearPreview();
        }} />
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => sourceInput.current?.click()}>
          {sourceFile ? tr("Αγγλικό:", "English:") + " " + sourceFile.name : tr("Επιλογή αγγλικού SRT", "Choose English SRT")}
        </button>
        <input ref={greekInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={event => {
          setGreekFile(event.target.files?.[0] ?? null);
          clearPreview();
        }} />
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => greekInput.current?.click()}>
          {greekFile ? tr("Ελληνικό:", "Greek:") + " " + greekFile.name : tr("Επιλογή ελληνικού SRT", "Choose Greek SRT")}
        </button>
      </div>
      <div className="fileRow">
        {candidate ? (
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={clearPreview}>
            {tr("Κλείσιμο προεπισκόπησης", "Close preview")}
          </button>
        ) : (
          <button type="button" className="secondary" disabled={!sourceFile || !greekFile || Boolean(busy)} onClick={startPreview}>
            {busy === "preview" ? tr("Έλεγχος αρχείων…", "Checking files…") : tr("Προεπισκόπηση SRT", "Preview SRTs")}
          </button>
        )}
        <button type="button" className="publish" disabled={!canPublish} onClick={importRevision}>
          {busy === "publish" ? tr("Δημοσίευση…", "Publishing…") : tr("Δημοσίευση υποτίτλων", "Publish subtitles")}
        </button>
      </div>
      {candidate && !published ? <p className="result" role="status">
        {!candidate.track.audit.readable
          ? tr("Η προεπισκόπηση είναι ενεργή. Οι υπότιτλοι χρειάζονται έλεγχο αναγνωσιμότητας πριν από τη δημοσίευση.", "Preview is active. The subtitles need a readability review before publishing.")
          : played
            ? tr(`Εμφανίστηκαν υπότιτλοι στην αναπαραγωγή. Το ζεύγος περιέχει ${candidate.sourceCueCount} υποτίτλους.`, `Subtitles appeared during playback. This pair contains ${candidate.sourceCueCount} subtitles.`)
            : tr("Η προεπισκόπηση είναι ενεργή. Πάτησε Αναπαραγωγή για να δεις τους υπότιτλους στο βίντεο.", "Preview is active. Press Play to see the subtitles on the video.")}
      </p> : null}
      {message ? <p className="result" role="status">{message}</p> : null}
      <style jsx>{`
        .sourceImport{margin:18px 0;padding:16px;border:1px solid rgba(244,178,82,.36);border-radius:16px;background:rgba(244,178,82,.06);display:grid;gap:12px}
        .sourceImport h3{margin:0 0 5px;font-size:16px}
        .sourceImport p{margin:0;color:#c8c7cc;font-size:14px;line-height:1.45}
        .fileRow{display:flex;gap:8px;flex-wrap:wrap;min-width:0}
        button{min-height:44px;max-width:100%;padding:8px 12px;border:0;border-radius:10px;font:inherit;font-size:14px;font-weight:650;overflow-wrap:anywhere;cursor:pointer}
        .secondary{background:#2a2930;color:#f5f4f6}
        .publish{background:#f4b252;color:#1b1409}
        button:focus-visible{outline:2px solid #f4b252;outline-offset:2px}
        button:disabled{opacity:.45;cursor:not-allowed}
        .sourceImport .result{color:#f7d79c}
      `}</style>
    </section>
  );
}
