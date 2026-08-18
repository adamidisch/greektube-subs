"use client";

import {useEffect} from "react";
import {watchAppNavigation} from "./navigation-events";

const LINKS=["Contact","Donate","Terms","Privacy"] as const;

export default function SimpleFooterEnhancer(){
  useEffect(()=>{
    let raf=0;
    const decorate=()=>{
      raf=0;
      document.querySelectorAll<HTMLElement>(".app-footer").forEach(footer=>{
        footer.classList.add("gts-simple-footer");
        if(footer.querySelector(".gts-footer-links"))return;
        const nav=document.createElement("nav");
        nav.className="gts-footer-links";
        nav.setAttribute("aria-label","Footer");
        LINKS.forEach(label=>{
          const button=document.createElement("button");
          button.type="button";
          button.textContent=label;
          button.dataset.footerDemo="1";
          button.setAttribute("aria-label",label);
          nav.appendChild(button);
        });
        footer.appendChild(nav);
      });
    };
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(decorate);};
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    const stop=watchAppNavigation(schedule);
    return()=>{observer.disconnect();stop();if(raf)cancelAnimationFrame(raf);};
  },[]);

  return <style>{`
    body .app-footer.gts-simple-footer {
      width: 100vw !important;
      max-width: none !important;
      min-height: 94px !important;
      margin: 72px 0 0 50% !important;
      padding: 24px max(28px, calc((100vw - 1200px) / 2)) !important;
      transform: translateX(-50%) !important;
      display: grid !important;
      grid-template-columns: auto minmax(0, 1fr) auto !important;
      grid-template-areas: "brand copy links" !important;
      align-items: center !important;
      gap: 18px 28px !important;
      border: 0 !important;
      border-top: 1px solid rgba(255,255,255,.085) !important;
      border-radius: 0 !important;
      background: linear-gradient(180deg, rgba(18,21,28,.5), rgba(11,13,18,.96)) !important;
      box-shadow: none !important;
      text-align: left !important;
    }
    body .app-footer.gts-simple-footer .app-footer-brand {
      grid-area: brand !important;
      justify-self: start !important;
      margin: 0 !important;
      gap: 8px !important;
      white-space: nowrap !important;
    }
    body .app-footer.gts-simple-footer .app-footer-brand .brand-mark {
      width: 29px !important;
      height: 22px !important;
    }
    body .app-footer.gts-simple-footer .app-footer-brand > span:last-child {
      font-size: 12px !important;
      font-weight: 650 !important;
      letter-spacing: -.02em !important;
    }
    body .app-footer.gts-simple-footer > p {
      grid-area: copy !important;
      margin: 0 !important;
      color: var(--soft) !important;
      font-size: 10.5px !important;
      line-height: 1.4 !important;
      text-align: left !important;
    }
    body .app-footer.gts-simple-footer .app-footer-note,
    body .app-footer.gts-simple-footer .footer-version-label {
      display: none !important;
    }
    body .app-footer.gts-simple-footer .gts-footer-links {
      grid-area: links !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 4px !important;
      white-space: nowrap !important;
    }
    body .app-footer.gts-simple-footer .gts-footer-links button {
      min-height: 32px !important;
      padding: 0 9px !important;
      border: 0 !important;
      border-radius: 8px !important;
      background: transparent !important;
      color: #8f95a2 !important;
      font: inherit !important;
      font-size: 10px !important;
      font-weight: 520 !important;
      cursor: default !important;
      transition: color .16s ease, background .16s ease !important;
    }
    body .app-footer.gts-simple-footer .gts-footer-links button:hover {
      color: #d8dbe3 !important;
      background: rgba(255,255,255,.045) !important;
    }
    html[data-theme="light"] body .app-footer.gts-simple-footer {
      border-top-color: rgba(27,31,42,.10) !important;
      background: linear-gradient(180deg, rgba(249,249,251,.76), rgba(241,242,246,.98)) !important;
    }
    html[data-theme="light"] body .app-footer.gts-simple-footer .gts-footer-links button {
      color: #6f7480 !important;
    }
    @media (max-width: 700px) {
      body .app-footer.gts-simple-footer {
        min-height: 0 !important;
        margin-top: 54px !important;
        padding: 22px 18px max(24px, env(safe-area-inset-bottom)) !important;
        grid-template-columns: 1fr auto !important;
        grid-template-areas: "brand links" "copy copy" !important;
        gap: 10px 14px !important;
      }
      body .app-footer.gts-simple-footer > p {
        font-size: 10px !important;
      }
      body .app-footer.gts-simple-footer .gts-footer-links {
        gap: 0 !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
      body .app-footer.gts-simple-footer .gts-footer-links button {
        min-height: 30px !important;
        padding: 0 6px !important;
        font-size: 9px !important;
      }
    }
    @media (max-width: 430px) {
      body .app-footer.gts-simple-footer {
        grid-template-columns: 1fr !important;
        grid-template-areas: "brand" "copy" "links" !important;
      }
      body .app-footer.gts-simple-footer .gts-footer-links {
        justify-content: flex-start !important;
      }
    }
  `}</style>;
}
