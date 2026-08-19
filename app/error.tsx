"use client";

import {useEffect} from "react";

function isAssetLoadError(error:Error){
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|failed to load module script/i.test(`${error.name} ${error.message}`);
}

export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{
    if(!isAssetLoadError(error))return;
    const key="gts-chunk-recovery";
    try{
      const previous=Number(sessionStorage.getItem(key)||0);
      const now=Date.now();
      if(!previous||now-previous>60000){
        sessionStorage.setItem(key,String(now));
        window.location.reload();
      }
    }catch{}
  },[error]);

  return <main className="gts-error-page">
    <section>
      <span className="gts-error-logo" aria-hidden="true"/>
      <small>GREEKTUBE SUBS</small>
      <h1>Κάτι δεν φόρτωσε σωστά</h1>
      <p>Δοκίμασε ξανά. Η βιβλιοθήκη και οι προσωπικές ρυθμίσεις σου δεν επηρεάζονται.</p>
      <div><button onClick={reset}>Δοκιμή ξανά</button><a href="/">Αρχική</a></div>
    </section>
    <style>{`
      .gts-error-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#090b0f;color:#f4f2ed;font-family:var(--font-ui),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.gts-error-page section{width:min(480px,100%);padding:34px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:#11151d;box-shadow:0 30px 90px rgba(0,0,0,.34)}.gts-error-logo{display:block;width:38px;height:32px;margin-bottom:22px;background:url('/gtslogo.svg') center/contain no-repeat}.gts-error-page small{color:#968aeb;font-size:11px;font-weight:800;letter-spacing:.14em}.gts-error-page h1{margin:9px 0 12px;font-size:32px;line-height:1.08;letter-spacing:-.04em}.gts-error-page p{margin:0;color:#9ba1ab;font-size:15px;line-height:1.6}.gts-error-page div{display:flex;gap:10px;margin-top:24px}.gts-error-page button,.gts-error-page a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 16px;border-radius:11px;font-size:14px;font-weight:700;text-decoration:none}.gts-error-page button{border:0;background:#7769dc;color:#fff}.gts-error-page a{border:1px solid rgba(255,255,255,.1);color:#c3c7ce;background:#171b23}@media(max-width:520px){.gts-error-page{padding:16px}.gts-error-page section{padding:28px 22px}.gts-error-page h1{font-size:28px}.gts-error-page p{font-size:14.5px}.gts-error-page div{display:grid;grid-template-columns:1fr 1fr}}
    `}</style>
  </main>;
}
