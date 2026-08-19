"use client";

import {useEffect} from "react";

export default function PlayerUIAuditEnhancer(){
  useEffect(()=>{
    let raf=0;
    const cleanSettingsLabels=()=>{
      raf=0;
      document.querySelectorAll<HTMLButtonElement>('.viewer .icon-button[aria-label="Ρυθμίσεις"]').forEach(button=>{
        Array.from(button.childNodes).forEach(node=>{
          if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim())node.textContent="";
        });
      });
    };
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(cleanSettingsLabels);};
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);};
  },[]);

  return <style>{`
    .viewer .icon-button[aria-label="Ρυθμίσεις"],
    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"],
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"],
    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"],
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]{
      font-size:0!important;
    }

    .viewer .icon-button[aria-label="Ρυθμίσεις"]::before,
    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]::before{
      content:"";
      display:block;
      width:17px;
      height:17px;
      background:currentColor;
      -webkit-mask-position:center;
      mask-position:center;
      -webkit-mask-repeat:no-repeat;
      mask-repeat:no-repeat;
      -webkit-mask-size:contain;
      mask-size:contain;
    }

    .viewer .icon-button[aria-label="Ρυθμίσεις"]::before{
      -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' fill='none' stroke='black' stroke-width='1.8'/%3E%3Cpath d='M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51v.09a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5.1 7.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V1.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1h.17a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.01 1Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' fill='none' stroke='black' stroke-width='1.8'/%3E%3Cpath d='M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51v.09a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5.1 7.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V1.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1h.17a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.01 1Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }

    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]::before{
      width:15px;height:15px;
      -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }

    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]::before{
      width:15px;height:15px;
      -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
  `}</style>;
}
