"use client";

import { useEffect, useRef, useState } from "react";

type Validation = {
  ok: boolean;
  cueCount: number;
  expectedCueCount: number;
  timestampMismatches: number;
  numericMismatches: number;
  missingCues: number;
  extraCues: number;
  duplicateCues: number;
  emptyCues: number;
  greekRatio: number;
  sourceHash: string;
  timestampHash: string;
};

type Manifest = {
  videoId: string;
  revision: number;
  transcriptVersion: number;
  cueCount: number;
  sourceHash: string;
  timestampHash: string;
  status: "frozen" | "validated" | "publishing" | "published";
  validation: Validation | null;
  ownerLockedAt: string;
  validatedAt: string | null;
  publishedAt: string | null;
};

type ApiResult = { manifest?: Manifest | null; validation?: Validation; legacyOwner?: boolean; error?: string };

function shortHash(value?: string | null) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
}

export default function OwnerTranslationPanel({ videoId }: { videoId: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [legacyOwner, setLegacyOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"freeze" | "validate" | "publish" | "">("");
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch(`/api/owner-translation?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error || "Το owner translation state δεν φορτώθηκε.");
      setManifest(result.manifest || null);
      setLegacyOwner(Boolean(result.legacyOwner));
      setValidation(result.manifest?.validation || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Το owner translation state δεν φορτώθηκε.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [videoId]);

  async function action(name: "freeze" | "publish", payload: Record<string, unknown> = {}) {
    setBusy(name); setMessage("");
    try {
      const response = await fetch("/api/owner-translation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, videoId, ...payload }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error || "Η ενέργεια απέτυχε.");
      if (result.manifest) setManifest(result.manifest);
      setValidation(result.manifest?.validation || validation);
      setMessage(name === "freeze" ? "Το canonical source κλειδώθηκε." : "Η owner μετάφραση δημοσιεύτηκε.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy("");
    }
  }

  async function validateFile(file: File) {
    setBusy("validate"); setMessage("");
    try {
      const subtitleText = await file.text();
      const response = await fetch("/api/owner-translation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", videoId, subtitleText }),
      });
      const result = await response.json() as ApiResult;
      if (result.validation) setValidation(result.validation);
      if (result.manifest) setManifest(result.manifest);
      if (!response.ok) throw new Error(result.error || "Το SRT δεν πέρασε validation.");
      setMessage("Το ελληνικό SRT πέρασε όλα τα strict checks.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Το SRT δεν πέρασε validation.");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const statusLabel = !manifest ? (legacyOwner ? "OWNER · LEGACY" : "AUTOMATIC") : manifest.status === "frozen" ? "OWNER · SOURCE FROZEN" : manifest.status === "validated" ? "OWNER · VALIDATED" : manifest.status === "publishing" ? "OWNER · PUBLISHING" : "OWNER · PUBLISHED";
  const canValidate = Boolean(manifest && (manifest.status === "frozen" || manifest.status === "validated"));
  const canPublish = Boolean(manifest?.status === "validated" && (manifest.validation?.ok || validation?.ok));

  return <section className="gts-owner-card">
    <div className="gts-owner-head">
      <div><span>OWNER TRANSLATION</span><h2>Μετάφραση ChatGPT</h2></div>
      <strong className={manifest ? `state-${manifest.status}` : "state-auto"}>{statusLabel}</strong>
    </div>

    {loading ? <div className="gts-owner-loading">Φόρτωση owner state…</div> : <>
      {!manifest ? <div className="gts-owner-intro">
        <p>{legacyOwner ? "Υπάρχει legacy owner lock. Κάνε Freeze Source για να μεταφερθεί στο νέο immutable manifest." : "Κλείδωσε το τρέχον αγγλικό transcript ως immutable source πριν ξεκινήσει manual μετάφραση."}</p>
        <button className="gts-owner-primary" disabled={Boolean(busy)} onClick={() => void action("freeze")}>{busy === "freeze" ? "Freeze…" : "Freeze Source"}</button>
      </div> : <>
        <div className="gts-owner-meta">
          <div><small>REVISION</small><b>r{manifest.revision}</b></div>
          <div><small>CUES</small><b>{manifest.cueCount.toLocaleString("el-GR")}</b></div>
          <div><small>SOURCE HASH</small><b title={manifest.sourceHash}>{shortHash(manifest.sourceHash)}</b></div>
        </div>
        <div className="gts-owner-actions">
          <a className="gts-owner-button" href={`/api/owner-translation?videoId=${encodeURIComponent(videoId)}&download=srt`}>English SRT</a>
          <a className="gts-owner-button" href={`/api/owner-translation?videoId=${encodeURIComponent(videoId)}&download=package`}>Manifest Package</a>
          {canValidate && <><button className="gts-owner-button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy === "validate" ? "Validating…" : "Import Greek SRT"}</button><input ref={fileRef} hidden type="file" accept=".srt,.vtt,text/plain" onChange={event => { const file = event.target.files?.[0]; if (file) void validateFile(file); }}/></>}
          {canPublish && <button className="gts-owner-primary" disabled={Boolean(busy)} onClick={() => void action("publish")}>{busy === "publish" ? "Publishing…" : "Publish"}</button>}
          {manifest.status === "published" && <button className="gts-owner-button" disabled={Boolean(busy)} onClick={() => void action("freeze", { newRevision: true })}>{busy === "freeze" ? "Creating…" : "New Revision"}</button>}
        </div>
      </>}

      {(validation || manifest?.validation) && (() => {
        const check = validation || manifest?.validation;
        if (!check) return null;
        return <div className={`gts-owner-validation ${check.ok ? "ok" : "bad"}`}>
          <div><span>Canonical source</span><b>✓</b></div>
          <div><span>Cues</span><b>{check.cueCount}/{check.expectedCueCount}</b></div>
          <div><span>Timestamps</span><b>{check.timestampMismatches === 0 ? "✓" : check.timestampMismatches}</b></div>
          <div><span>Missing cues</span><b>{check.missingCues}</b></div>
          <div><span>Extra cues</span><b>{check.extraCues}</b></div>
          <div><span>Duplicate cues</span><b>{check.duplicateCues}</b></div>
          <div><span>Numeric mismatches</span><b>{check.numericMismatches}</b></div>
          <div><span>Empty cues</span><b>{check.emptyCues}</b></div>
        </div>;
      })()}
    </>}

    {message && <div className="gts-owner-message" role="status">{message}</div>}
    <style>{styles}</style>
  </section>;
}

const styles = `
.gts-owner-card{margin-top:14px;padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:linear-gradient(180deg,rgba(126,111,224,.08),rgba(255,255,255,.025));color:#eef0f4}.gts-owner-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:13px}.gts-owner-head span{display:block;color:#9084ee;font-size:8px;font-weight:760;letter-spacing:.13em}.gts-owner-head h2{margin:3px 0 0;font-size:13px;font-weight:650}.gts-owner-head>strong{max-width:150px;padding:5px 7px;border-radius:999px;background:#171a20;color:#8d929c;font-size:7.5px;line-height:1.2;letter-spacing:.05em;text-align:center}.gts-owner-head>strong.state-frozen{color:#d7bd7d;background:rgba(183,139,65,.12)}.gts-owner-head>strong.state-validated{color:#94d6ae;background:rgba(74,155,107,.13)}.gts-owner-head>strong.state-publishing{color:#e2c47e;background:rgba(189,146,67,.14)}.gts-owner-head>strong.state-published{color:#a99ef5;background:rgba(117,105,217,.15)}.gts-owner-intro p,.gts-owner-message,.gts-owner-loading{margin:0;color:#9298a2;font-size:10px;line-height:1.5}.gts-owner-meta{display:grid;grid-template-columns:.6fr .7fr 1.7fr;gap:7px;margin-bottom:10px}.gts-owner-meta>div{min-width:0;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(0,0,0,.16)}.gts-owner-meta small{display:block;color:#666d78;font-size:7px;font-weight:700;letter-spacing:.08em}.gts-owner-meta b{display:block;overflow:hidden;text-overflow:ellipsis;margin-top:3px;color:#dce0e7;font:600 9px var(--font-geist-mono),monospace;white-space:nowrap}.gts-owner-actions{display:flex;flex-wrap:wrap;gap:7px}.gts-owner-button,.gts-owner-primary{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#151920;color:#d9dde5;font-size:9px;font-weight:650;text-decoration:none}.gts-owner-primary{border-color:rgba(131,115,230,.4);background:#7569d9;color:#fff}.gts-owner-button:disabled,.gts-owner-primary:disabled{opacity:.42}.gts-owner-validation{display:grid;gap:5px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)}.gts-owner-validation>div{display:flex;justify-content:space-between;gap:10px;color:#828894;font-size:9px}.gts-owner-validation b{color:#d9dde4}.gts-owner-validation.ok b{color:#82c69e}.gts-owner-validation.bad b{color:#d9a064}.gts-owner-message{margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}@media(max-width:720px){.gts-owner-card{margin-top:10px;padding:13px}.gts-owner-head{align-items:center}.gts-owner-meta{grid-template-columns:.62fr .7fr 1.4fr}.gts-owner-actions>*{flex:1 1 auto}}
`;
