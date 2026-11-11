"use client";

import { useRef, useState } from "react";
import { tr, useAppLanguage } from "./app-language";
import { MAX_OWNER_SRT_SIZE, prepareOwnerSourcePreview } from "./owner-source-preview";

type Props = { videoId: string; onNeedLogin: () => void };

// One-step owner import on the video details screen: English + Greek SRT with identical timings.
// The server (/api/owner-translation/source-import) re-validates everything and requires an admin session.
export default function DetailsSrtImport({ videoId, onNeedLogin }: Props) {
  useAppLanguage();
  const englishInput = useRef<HTMLInputElement>(null);
  const greekInput = useRef<HTMLInputElement>(null);
  const [english, setEnglish] = useState<File | null>(null);
  const [greek, setGreek] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function publish() {
    if (!english || !greek || busy || done) return;
    setBusy(true);
    setMessage(null);
    try {
      const auth = await fetch("/api/admin-auth", { cache: "no-store" }).then(r => r.json()).catch(() => ({})) as { authorized?: boolean };
      if (!auth.authorized) {
        setMessage(tr("Χρειάζεται σύνδεση διαχειριστή. Βάλε τον κωδικό και δοκίμασε ξανά.", "Admin sign-in required. Enter the password and try again."));
        onNeedLogin();
        return;
      }
      if (english.size > MAX_OWNER_SRT_SIZE || greek.size > MAX_OWNER_SRT_SIZE) {
        throw new Error(tr("Κάθε αρχείο SRT πρέπει να είναι έως 2 MB.", "Each SRT file must be 2 MB or smaller."));
      }
      const [sourceSubtitleText, subtitleText] = await Promise.all([english.text(), greek.text()]);
      const check = prepareOwnerSourcePreview(sourceSubtitleText, subtitleText);
      if (check.error) {
        const errors = {
          number: tr(`Οι αριθμοί διαφέρουν στον υπότιτλο ${"cue" in check ? check.cue : ""}.`, `Numbers differ in subtitle ${"cue" in check ? check.cue : ""}.`),
          size: tr("Κάθε αρχείο SRT πρέπει να είναι έως 2 MB.", "Each SRT file must be 2 MB or smaller."),
          english: tr("Το αγγλικό SRT δεν περιέχει έγκυρους υπότιτλους.", "The English SRT has no valid subtitles."),
          greek: tr("Το ελληνικό SRT δεν περιέχει έγκυρους ελληνικούς υπότιτλους.", "The Greek SRT has no valid Greek subtitles."),
          timing: tr("Τα SRT πρέπει να έχουν το ίδιο πλήθος υποτίτλων και ίδιους χρόνους.", "Both SRTs must have the same subtitle count and timings."),
        };
        throw new Error(errors[check.error]);
      }
      if (!check.track.audit.readable) {
        throw new Error(tr("Κάποιοι υπότιτλοι περνούν πολύ γρήγορα για να διαβαστούν. Διόρθωσε το SRT ή έλεγξέ το από την Επεξεργασία βίντεο.", "Some subtitles are too fast to read. Fix the SRT or review it in the video editor."));
      }
      const response = await fetch("/api/owner-translation/source-import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, sourceSubtitleText, subtitleText }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; sourceCueCount?: number };
      if (!response.ok) throw new Error(result.error || tr("Η εισαγωγή απέτυχε.", "Import failed."));
      setDone(true);
      setMessage(tr(`Δημοσιεύτηκαν ${result.sourceCueCount ?? check.sourceCueCount} υπότιτλοι. Φόρτωση…`, `Published ${result.sourceCueCount ?? check.sourceCueCount} subtitles. Loading…`));
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("Η εισαγωγή απέτυχε.", "Import failed."));
    } finally {
      setBusy(false);
    }
  }

  const pick = (file: File | null, fallback: string) => file ? file.name : fallback;

  return (
    <div className="video-details-option recommended details-srt-import">
      <small>{tr("ΕΙΣΑΓΩΓΗ ΕΤΟΙΜΩΝ ΥΠΟΤΙΤΛΩΝ", "IMPORT FINISHED SUBTITLES")}</small>
      <p>{tr("Επίλεξε το αγγλικό και το ελληνικό SRT με ίδιους χρόνους. Ελέγχονται και δημοσιεύονται αμέσως.", "Choose the English and the Greek SRT with identical timings. They are checked and published right away.")}</p>
      <div className="details-srt-files">
        <input ref={englishInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={event => { setEnglish(event.target.files?.[0] ?? null); setMessage(null); }}/>
        <input ref={greekInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={event => { setGreek(event.target.files?.[0] ?? null); setMessage(null); }}/>
        <button type="button" className={`secondary ${english ? "picked" : ""}`} disabled={busy || done} onClick={() => englishInput.current?.click()}><b>EN</b><span>{pick(english, tr("Αγγλικό SRT", "English SRT"))}</span></button>
        <button type="button" className={`secondary ${greek ? "picked" : ""}`} disabled={busy || done} onClick={() => greekInput.current?.click()}><b>EL</b><span>{pick(greek, tr("Ελληνικό SRT", "Greek SRT"))}</span></button>
      </div>
      <button type="button" className="primary details-srt-publish" disabled={!english || !greek || busy || done} onClick={() => void publish()}>{busy ? tr("Έλεγχος…", "Checking…") : tr("Έλεγχος και δημοσίευση", "Check and publish")}</button>
      {message && <p className={done ? "details-srt-ok" : "form-error"} role="status">{message}</p>}
    </div>
  );
}
