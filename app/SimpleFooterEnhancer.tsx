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
        footer.classList.add("gts-site-footer");
        if(footer.querySelector(".gts-footer-links"))return;
        const nav=document.createElement("nav");
        nav.className="gts-footer-links";
        nav.setAttribute("aria-label","Footer navigation");
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
    body .app-footer.gts-site-footer {
      width: 100vw !important;
      max-width: none !important;
      min-height: 0 !important;
      margin: 76px 0 0 calc(50% - 50vw) !important;
      padding: 27px max(24px, calc((100vw - 1200px) / 2)) 29px !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-template-areas: "brand links" "copy links" !important;
      align-items: center !important;
      column-gap: 42px !important;
      row-gap: 5px !important;
      border: 0 !important;
      border-top: 1px solid rgba(255,255,255,.075) !important;
      border-radius: 0 !important;
      background: #0c0f14 !important;
      box-shadow: none !important;
      text-align: left !important;
    }

    body .app-footer.gts-site-footer .app-footer-brand {
      grid-area: brand !important;
      width: fit-content !important;
      min-width: 0 !important;
      min-height: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      justify-self: start !important;
      gap: 8px !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      color: var(--text) !important;
      white-space: nowrap !important;
    }
    body .app-footer.gts-site-footer .app-footer-brand:hover {
      background: transparent !important;
      box-shadow: none !important;
    }
    body .app-footer.gts-site-footer .app-footer-brand .brand-mark {
      width: 27px !important;
      height: 21px !important;
      flex: 0 0 27px !important;
    }
    body .app-footer.gts-site-footer .app-footer-brand > span:last-child {
      font-size: 12px !important;
      font-weight: 660 !important;
      letter-spacing: -.025em !important;
      line-height: 1 !important;
    }

    body .app-footer.gts-site-footer > p {
      grid-area: copy !important;
      max-width: 520px !important;
      margin: 0 !important;
      color: #737985 !important;
      font-size: 10px !important;
      line-height: 1.45 !important;
      text-align: left !important;
    }

    body .app-footer.gts-site-footer .app-footer-note,
    body .app-footer.gts-site-footer .footer-version-label {
      display: none !important;
    }

    body .app-footer.gts-site-footer .gts-footer-links {
      grid-area: links !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      white-space: nowrap !important;
    }
    body .app-footer.gts-site-footer .gts-footer-links button {
      position: relative !important;
      min-width: 0 !important;
      min-height: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 4px 10px !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      color: #858b96 !important;
      font: inherit !important;
      font-size: 9.5px !important;
      font-weight: 520 !important;
      line-height: 1.2 !important;
      letter-spacing: .005em !important;
      cursor: default !important;
      transition: color .16s ease !important;
    }
    body .app-footer.gts-site-footer .gts-footer-links button + button::before {
      content: "" !important;
      position: absolute !important;
      left: 0 !important;
      top: 50% !important;
      width: 1px !important;
      height: 10px !important;
      background: rgba(255,255,255,.10) !important;
      transform: translateY(-50%) !important;
    }
    body .app-footer.gts-site-footer .gts-footer-links button:hover {
      color: #c8ccd4 !important;
      background: transparent !important;
    }

    html[data-theme="light"] body .app-footer.gts-site-footer {
      border-top-color: rgba(24,28,38,.09) !important;
      background: #f5f6f8 !important;
    }
    html[data-theme="light"] body .app-footer.gts-site-footer > p {
      color: #7a7e87 !important;
    }
    html[data-theme="light"] body .app-footer.gts-site-footer .gts-footer-links button {
      color: #6c717c !important;
    }
    html[data-theme="light"] body .app-footer.gts-site-footer .gts-footer-links button + button::before {
      background: rgba(20,24,32,.11) !important;
    }

    @media (max-width: 700px) {
      body .app-footer.gts-site-footer {
        margin-top: 58px !important;
        padding: 23px 18px max(25px, env(safe-area-inset-bottom)) !important;
        grid-template-columns: 1fr !important;
        grid-template-areas: "brand" "copy" "links" !important;
        row-gap: 9px !important;
      }
      body .app-footer.gts-site-footer > p {
        max-width: 360px !important;
        font-size: 9.5px !important;
      }
      body .app-footer.gts-site-footer .gts-footer-links {
        justify-content: flex-start !important;
        margin-top: 4px !important;
      }
      body .app-footer.gts-site-footer .gts-footer-links button {
        padding: 4px 9px !important;
        font-size: 9.5px !important;
      }
      body .app-footer.gts-site-footer .gts-footer-links button:first-child {
        padding-left: 0 !important;
      }
    }
  `}</style>;
}
