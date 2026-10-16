"use client";

import { useEffect, useState } from "react";
import OwnerSourceImportPanel from "../../OwnerSourceImportPanel";

const VIDEO_ID = "xYB6uYyRjCA";

export default function SourceImportPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/admin-auth", { credentials: "same-origin", cache: "no-store" })
      .then(response => response.json())
      .then((result: { authorized?: boolean }) => setAuthorized(Boolean(result.authorized)))
      .catch(() => setAuthorized(false));
  }, []);

  return (
    <main className="page">
      <a href={"/?video=" + VIDEO_ID}>← Επιστροφή στο βίντεο</a>
      <h1>Εισαγωγή ελεγμένου source</h1>
      <p>Admin εργαλείο για το συγκεκριμένο βίντεο. Το endpoint ελέγχει ξανά cue count και όλα τα timestamps πριν από τη δημοσίευση.</p>
      {authorized === null ? <p>Έλεγχος admin session…</p> : null}
      {authorized === false ? <p role="alert">Απαιτείται ενεργό admin session.</p> : null}
      {authorized ? <OwnerSourceImportPanel videoId={VIDEO_ID} onPublished={() => undefined} /> : null}
      <style jsx>{`
        .page{width:min(760px,calc(100% - 32px));margin:56px auto;font-family:Arial,sans-serif;color:#f4f2f7}.page a{color:#f4b252}.page h1{margin:24px 0 8px}.page>p{color:#cbc8d0;line-height:1.55}body{background:#121217}
      `}</style>
    </main>
  );
}
