"use client";

import {useEffect} from "react";
import {APP_VERSION} from "./version";

const FOOTER_HTML=()=>{
  const year=new Date().getFullYear();
  return `
    <div class="gts-global-footer-accent" aria-hidden="true"></div>
    <div class="gts-global-footer-inner">
      <div class="gts-global-footer-left">
        <button type="button" class="gts-global-footer-brand" aria-label="Αρχική σελίδα">
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
        <p>Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.</p>
        <small>Φτιαγμένο με <b>♥</b> για ελληνόφωνους θεατές</small>
      </div>
      <div class="gts-global-footer-right">
        <nav aria-label="Νομικές πληροφορίες">
          <a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a>
        </nav>
        <div class="gts-global-footer-meta">
          <span>© ${year} GreekTube Subs</span>
          <i aria-hidden="true">·</i>
          <span>Version ${APP_VERSION}</span>
        </div>
      </div>
    </div>`;
};

function goHome(){
  const home=document.querySelector<HTMLButtonElement>(".brand-home");
  if(home){home.click();return;}
  if(location.pathname!=="/"||location.search)location.assign("/");
  else window.scrollTo({top:0,behavior:"smooth"});
}

function hydrateFooter(footer:HTMLElement){
  if(footer.dataset.globalFooter==="1")return;
  footer.dataset.globalFooter="1";
  footer.className="gts-global-footer";
  footer.innerHTML=FOOTER_HTML();
  footer.querySelector<HTMLButtonElement>(".gts-global-footer-brand")?.addEventListener("click",goHome);
}

export default function SimpleFooterEnhancer(){
  useEffect(()=>{
    let raf=0;
    const decorate=()=>{
      raf=0;
      document.querySelectorAll<HTMLElement>(".app-footer").forEach(hydrateFooter);

      const editor=document.querySelector<HTMLElement>(".gts-editor-screen");
      if(editor&&!editor.querySelector(":scope > .gts-global-footer")){
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
    body .gts-global-footer{
      width:100vw!important;max-width:none!important;min-height:0!important;
      margin:72px 0 0 calc(50% - 50vw)!important;
      padding:0 0 max(32px,env(safe-area-inset-bottom))!important;
      border:0!important;border-radius:0!important;
      background:#11151d!important;color:#f6f3ec!important;
      box-shadow:none!important;overflow:hidden!important;text-align:left!important;
    }
    body .gts-global-footer-accent{
      height:1px;width:100%;
      background:linear-gradient(90deg,transparent 5%,rgba(132,112,245,.8) 32%,rgba(81,191,214,.55) 70%,transparent 95%);
    }
    body .gts-global-footer-inner{
      width:min(1120px,calc(100% - 48px))!important;
      margin:0 auto!important;padding:34px 0 0!important;
      display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:56px!important;
    }
    body .gts-global-footer-left{display:flex!important;flex-direction:column!important;align-items:flex-start!important;min-width:0!important;}
    body .gts-global-footer-brand{
      display:inline-flex!important;align-items:center!important;gap:9px!important;
      min-width:0!important;min-height:0!important;height:auto!important;
      margin:0 0 12px!important;padding:2px 3px!important;border:0!important;border-radius:7px!important;
      background:transparent!important;box-shadow:none!important;color:#f6f3ec!important;cursor:pointer!important;
    }
    body .gts-global-footer-brand:hover{opacity:.88!important;background:transparent!important;}
    body .gts-global-footer-brand:focus-visible{outline:2px solid rgba(157,143,245,.7)!important;outline-offset:5px!important;}
    body .gts-global-footer-brand svg{display:block!important;width:30px!important;height:24px!important;flex:0 0 auto!important;}
    body .gts-global-footer-brand>span{font-size:15px!important;font-weight:650!important;letter-spacing:-.01em!important;line-height:1!important;white-space:nowrap!important;}
    body .gts-global-footer-brand b{color:#9d8ff5!important;font-weight:650!important;}
    body .gts-global-footer-left>p{max-width:390px!important;margin:0 0 6px!important;color:#989eaa!important;font-size:12.5px!important;line-height:1.5!important;text-align:left!important;}
    body .gts-global-footer-left>small{margin:0!important;color:#626a76!important;font-size:11.5px!important;line-height:1.35!important;}
    body .gts-global-footer-left>small b{color:#9d8ff5!important;font-weight:500!important;}
    body .gts-global-footer-right{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:flex-end!important;min-width:max-content!important;}
    body .gts-global-footer-right nav{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:14px!important;margin:0 0 8px!important;}
    body .gts-global-footer-right nav a{color:#858b96!important;font-size:12px!important;text-decoration:none!important;transition:color .15s ease!important;}
    body .gts-global-footer-right nav a:hover,body .gts-global-footer-right nav a:focus-visible{color:#b2a9f0!important;}
    body .gts-global-footer-meta{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:7px!important;color:#565e6a!important;font-size:11px!important;letter-spacing:.01em!important;white-space:nowrap!important;}
    body .gts-global-footer-meta i{font-style:normal!important;color:#444c57!important;}
    .gts-editor-screen>.gts-global-footer{width:100%!important;margin:72px 0 0!important;flex:0 0 auto!important;}

    html[data-theme="light"] body .gts-global-footer{background:#eef1f6!important;color:#24242b!important;}
    html[data-theme="light"] body .gts-global-footer-brand{color:#24242b!important;}
    html[data-theme="light"] body .gts-global-footer-left>p{color:#707781!important;}
    html[data-theme="light"] body .gts-global-footer-left>small,html[data-theme="light"] body .gts-global-footer-meta{color:#8a9099!important;}
    html[data-theme="light"] body .gts-global-footer-right nav a{color:#747a84!important;}

    @media(max-width:700px){
      body .gts-global-footer{margin-top:54px!important;padding-bottom:max(26px,env(safe-area-inset-bottom))!important;}
      body .gts-global-footer-inner{
        width:min(100% - 32px,1120px)!important;padding-top:28px!important;
        display:grid!important;grid-template-columns:1fr!important;gap:24px!important;
      }
      body .gts-global-footer-brand{gap:8px!important;margin-bottom:11px!important;}
      body .gts-global-footer-brand svg{width:27px!important;height:22px!important;}
      body .gts-global-footer-brand>span{font-size:14px!important;}
      body .gts-global-footer-left>p{max-width:310px!important;font-size:11.5px!important;line-height:1.48!important;}
      body .gts-global-footer-left>small{font-size:10.5px!important;}
      body .gts-global-footer-right{align-items:flex-start!important;width:100%!important;min-width:0!important;padding-top:20px!important;border-top:1px solid rgba(255,255,255,.07)!important;}
      body .gts-global-footer-right nav{justify-content:flex-start!important;gap:14px!important;margin-bottom:9px!important;}
      body .gts-global-footer-right nav a{font-size:11.5px!important;}
      body .gts-global-footer-meta{justify-content:flex-start!important;gap:6px!important;font-size:10.5px!important;white-space:normal!important;}
      .gts-editor-screen>.gts-global-footer{margin-top:48px!important;}
    }
  `}</style>;
}
