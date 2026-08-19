"use client";

import {useEffect} from "react";

function isAssetLoadError(error:Error){
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|failed to load module script/i.test(`${error.name} ${error.message}`);
}

export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{
    if(!isAssetLoadError(error))return;
    const key="gts-global-chunk-recovery";
    try{
      const previous=Number(sessionStorage.getItem(key)||0);
      const now=Date.now();
      if(!previous||now-previous>60000){
        sessionStorage.setItem(key,String(now));
        window.location.reload();
      }
    }catch{}
  },[error]);

  return <html lang="el"><body style={{margin:0}}><main className="gts-global-error">
    <section>
      <span className="gts-global-error-logo" aria-hidden="true"/>
      <small>GREEKTUBE SUBS</small>
      <h1>Η σελίδα δεν φόρτωσε σωστά</h1>
      <p>Κάνε μία νέα προσπάθεια. Αν είχε μείνει παλιό αρχείο από προηγούμενη έκδοση θα ανανεωθεί αυτόματα.</p>
      <div><button onClick={reset}>Δοκιμή ξανά</button><a href="/">Αρχική</a></div>
    </section>
    <style>{`
      .gts-global-error{min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#090b0f;color:#f4f2ed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.gts-global-error section{box-sizing:border-box;width:min(480px,100%);padding:34px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:#11151d;box-shadow:0 30px 90px rgba(0,0,0,.34)}.gts-global-error-logo{display:block;width:38px;height:32px;margin-bottom:22px;background:url('/gtslogo.svg') center/contain no-repeat}.gts-global-error small{color:#968aeb;font-size:11px;font-weight:800;letter-spacing:.14em}.gts-global-error h1{margin:9px 0 12px;font-size:32px;line-height:1.08;letter-spacing:-.04em}.gts-global-error p{margin:0;color:#9ba1ab;font-size:15px;line-height:1.6}.gts-global-error div{display:flex;gap:10px;margin-top:24px}.gts-global-error button,.gts-global-error a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 16px;border-radius:11px;font-size:14px;font-weight:700;text-decoration:none}.gts-global-error button{border:0;background:#7769dc;color:#fff}.gts-global-error a{border:1px solid rgba(255,255,255,.1);color:#c3c7ce;background:#171b23}@media(max-width:520px){.gts-global-error{padding:16px}.gts-global-error section{padding:28px 22px}.gts-global-error h1{font-size:28px}.gts-global-error p{font-size:14.5px}.gts-global-error div{display:grid;grid-template-columns:1fr 1fr}}
    `}</style>
  </main></body></html>;
}
