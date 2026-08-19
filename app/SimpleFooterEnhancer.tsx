"use client";

import {useEffect} from "react";
import {APP_VERSION} from "./version";

const FOOTER_HTML=()=>{
  const year=new Date().getFullYear();
  return `
    <div class="gts-standard-footer-inner">
      <div class="gts-standard-footer-left">
        <button type="button" class="gts-standard-footer-brand" aria-label="Αρχική σελίδα">
          <span class="gts-standard-footer-logo" aria-hidden="true"></span>
          <span>GreekTube <b>Subs</b></span>
        </button>
        <p class="gts-standard-footer-description">Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.</p>
        <p class="gts-standard-footer-made">Φτιαγμένο με <b>♥</b> για ελληνόφωνους θεατές</p>
      </div>
      <div class="gts-standard-footer-right">
        <nav class="gts-standard-footer-nav" aria-label="Νομικές πληροφορίες">
          <a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a>
        </nav>
        <div class="gts-standard-footer-meta">
          <a class="gts-standard-footer-admin" href="/admin/analytics">© ${year} GreekTube Subs</a><i aria-hidden="true">·</i><span>Version ${APP_VERSION}</span>
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
  if(footer.dataset.standardFooter==="1")return;
  footer.dataset.standardFooter="1";
  footer.className="gts-standard-footer";
  footer.innerHTML=FOOTER_HTML();
  footer.querySelector<HTMLButtonElement>(".gts-standard-footer-brand")?.addEventListener("click",goHome);
}

export default function SimpleFooterEnhancer(){
  useEffect(()=>{
    let raf=0;
    const decorate=()=>{
      raf=0;
      document.querySelectorAll<HTMLElement>(".app-footer").forEach(hydrateFooter);

      const editor=document.querySelector<HTMLElement>(".gts-editor-screen");
      if(editor&&!editor.querySelector(":scope > .gts-standard-footer")){
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

  return null;
}
