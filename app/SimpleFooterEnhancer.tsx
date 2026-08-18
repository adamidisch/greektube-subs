"use client";

import {useEffect} from "react";

const VERSION="7.8.37";

const FOOTER_HTML=`
  <div class="gts-claude-glow" aria-hidden="true">
    <i class="gts-claude-glow-short"></i>
    <i class="gts-claude-glow-long"></i>
  </div>
  <div class="gts-claude-footer-content">
    <button type="button" class="gts-claude-footer-brand" aria-label="Αρχική σελίδα">
      <svg width="30" height="24" viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="gts-footer-b1" x1="8" y1="4" x2="31" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#BFAEFF"/><stop offset="0.42" stop-color="#957FF8"/><stop offset="0.72" stop-color="#7662EE"/><stop offset="1" stop-color="#5443D8"/></linearGradient>
          <linearGradient id="gts-footer-e1" x1="20" y1="2.5" x2="20" y2="30.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#D7CEFF"/><stop offset="0.38" stop-color="#A796FF"/><stop offset="0.76" stop-color="#6C59E9"/><stop offset="1" stop-color="#4433B8"/></linearGradient>
        </defs>
        <path d="M7 3.5H33C36.6 3.5 38.5 5.4 38.5 9V21C38.5 24.6 36.6 26.5 33 26.5H18L11.5 31V26.5H7C3.4 26.5 1.5 24.6 1.5 21V9C1.5 5.4 3.4 3.5 7 3.5Z" fill="url(#gts-footer-b1)" stroke="url(#gts-footer-e1)" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M8.4 11H13.6" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M8.4 16H16.1" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M8.4 21H18.6" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M25 9.4L33.2 15.6L25 21.8V9.4Z" fill="#FFFFFF"/>
      </svg>
      <span>GreekTube <b>Subs</b></span>
    </button>
    <p>Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.</p>
    <small>Φτιαγμένο με <b>♥</b> για ελληνόφωνους θεατές</small>
    <span class="gts-claude-version"><i aria-hidden="true"></i>Version ${VERSION}</span>
  </div>`;

function goHome(){
  const home=document.querySelector<HTMLButtonElement>(".brand-home");
  if(home){home.click();return;}
  if(location.pathname!=="/"||location.search)location.assign("/");
  else window.scrollTo({top:0,behavior:"smooth"});
}

function hydrateFooter(footer:HTMLElement){
  if(footer.dataset.claudeFooter==="1")return;
  footer.dataset.claudeFooter="1";
  footer.className="gts-claude-footer";
  footer.innerHTML=FOOTER_HTML;
  footer.querySelector<HTMLButtonElement>(".gts-claude-footer-brand")?.addEventListener("click",goHome);
}

export default function SimpleFooterEnhancer(){
  useEffect(()=>{
    let raf=0;
    const decorate=()=>{
      raf=0;
      document.querySelectorAll<HTMLElement>(".app-footer").forEach(hydrateFooter);

      const editor=document.querySelector<HTMLElement>(".gts-editor-screen");
      if(editor&&!editor.querySelector(":scope > .gts-claude-footer")){
        const footer=document.createElement("footer");
        footer.setAttribute("aria-label","GreekTube Subs");
        hydrateFooter(footer);
        editor.appendChild(footer);
      }
    };
    const schedule=()=>{if(!raf)raf=window.requestAnimationFrame(decorate);};
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    return()=>{observer.disconnect();if(raf)window.cancelAnimationFrame(raf);};
  },[]);

  return <style>{`
    body .gts-claude-footer {
      width:100vw !important;
      max-width:none !important;
      min-height:0 !important;
      margin:72px 0 0 calc(50% - 50vw) !important;
      padding:0 0 max(30px,env(safe-area-inset-bottom)) !important;
      border:0 !important;
      border-radius:0 !important;
      background:#0a0a0d !important;
      box-shadow:none !important;
      color:#f6f3ec !important;
      text-align:center !important;
      overflow:hidden !important;
    }
    body .gts-claude-footer .gts-claude-glow {
      width:100% !important;
      padding-top:40px !important;
    }
    body .gts-claude-footer .gts-claude-glow i {
      display:block !important;
      height:1px !important;
      margin-inline:auto !important;
      pointer-events:none !important;
    }
    body .gts-claude-footer .gts-claude-glow-short {
      width:min(60%,760px) !important;
      margin-bottom:10px !important;
      background:linear-gradient(90deg,transparent 0%,rgba(143,124,246,0) 20%,rgba(143,124,246,.35) 50%,rgba(143,124,246,0) 80%,transparent 100%) !important;
    }
    body .gts-claude-footer .gts-claude-glow-long {
      width:100% !important;
      background:linear-gradient(90deg,transparent 0%,rgba(143,124,246,0) 15%,rgba(143,124,246,.85) 50%,rgba(143,124,246,0) 85%,transparent 100%) !important;
    }
    body .gts-claude-footer .gts-claude-footer-content {
      display:flex !important;
      flex-direction:column !important;
      align-items:center !important;
      width:min(100%,680px) !important;
      margin:0 auto !important;
      padding:28px 20px 0 !important;
      text-align:center !important;
    }
    body .gts-claude-footer .gts-claude-footer-brand {
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      gap:9px !important;
      min-width:0 !important;
      min-height:0 !important;
      height:auto !important;
      margin:0 0 14px !important;
      padding:2px 3px !important;
      border:0 !important;
      border-radius:7px !important;
      background:transparent !important;
      box-shadow:none !important;
      color:#f6f3ec !important;
      cursor:pointer !important;
      transition:opacity .16s ease !important;
    }
    body .gts-claude-footer .gts-claude-footer-brand:hover {opacity:.88 !important;background:transparent !important;}
    body .gts-claude-footer .gts-claude-footer-brand:focus-visible {outline:2px solid rgba(157,143,245,.7) !important;outline-offset:5px !important;}
    body .gts-claude-footer .gts-claude-footer-brand svg {display:block !important;width:30px !important;height:24px !important;flex:0 0 auto !important;}
    body .gts-claude-footer .gts-claude-footer-brand>span {font-size:15px !important;font-weight:650 !important;letter-spacing:-.01em !important;line-height:1 !important;white-space:nowrap !important;}
    body .gts-claude-footer .gts-claude-footer-brand b {color:#9d8ff5 !important;font-weight:650 !important;}
    body .gts-claude-footer .gts-claude-footer-content>p {
      max-width:320px !important;
      margin:0 0 6px !important;
      color:#8b9099 !important;
      font-size:12.5px !important;
      font-weight:400 !important;
      line-height:1.5 !important;
      text-align:center !important;
    }
    body .gts-claude-footer .gts-claude-footer-content>small {
      margin:0 0 18px !important;
      color:#5f6570 !important;
      font-size:11.5px !important;
      font-weight:400 !important;
      line-height:1.35 !important;
    }
    body .gts-claude-footer .gts-claude-footer-content>small b {color:#9d8ff5 !important;font-weight:500 !important;}
    body .gts-claude-footer .gts-claude-version {
      display:inline-flex !important;
      align-items:center !important;
      gap:6px !important;
      min-height:0 !important;
      padding:5px 12px !important;
      border:1px solid rgba(255,255,255,.1) !important;
      border-radius:999px !important;
      background:transparent !important;
      color:#8b9099 !important;
      font-size:10.5px !important;
      font-weight:400 !important;
      line-height:1.2 !important;
      letter-spacing:.02em !important;
    }
    body .gts-claude-footer .gts-claude-version i {width:5px !important;height:5px !important;border-radius:50% !important;background:#5fd98a !important;box-shadow:0 0 8px rgba(95,217,138,.2) !important;}

    .gts-editor-screen>.gts-claude-footer {
      width:100% !important;
      margin:72px 0 0 !important;
      flex:0 0 auto !important;
    }

    html[data-theme="light"] body .gts-claude-footer {background:#f7f7fa !important;color:#24242b !important;}
    html[data-theme="light"] body .gts-claude-footer .gts-claude-footer-brand {color:#24242b !important;}
    html[data-theme="light"] body .gts-claude-footer .gts-claude-footer-content>p {color:#70747d !important;}
    html[data-theme="light"] body .gts-claude-footer .gts-claude-footer-content>small {color:#8b8e96 !important;}
    html[data-theme="light"] body .gts-claude-footer .gts-claude-version {border-color:rgba(20,20,30,.1) !important;color:#767a83 !important;}

    @media(max-width:700px){
      body .gts-claude-footer {
        margin-top:54px !important;
        padding-bottom:max(24px,env(safe-area-inset-bottom)) !important;
      }
      body .gts-claude-footer .gts-claude-glow {padding-top:30px !important;}
      body .gts-claude-footer .gts-claude-glow-short {width:72% !important;margin-bottom:8px !important;}
      body .gts-claude-footer .gts-claude-footer-content {padding:23px 18px 0 !important;}
      body .gts-claude-footer .gts-claude-footer-brand {gap:8px !important;margin-bottom:12px !important;}
      body .gts-claude-footer .gts-claude-footer-brand svg {width:27px !important;height:22px !important;}
      body .gts-claude-footer .gts-claude-footer-brand>span {font-size:14px !important;}
      body .gts-claude-footer .gts-claude-footer-content>p {max-width:290px !important;font-size:11.5px !important;line-height:1.45 !important;}
      body .gts-claude-footer .gts-claude-footer-content>small {margin-bottom:16px !important;font-size:10.5px !important;}
      body .gts-claude-footer .gts-claude-version {padding:5px 11px !important;font-size:10px !important;}
      .gts-editor-screen>.gts-claude-footer {margin-top:48px !important;}
    }
  `}</style>;
}
