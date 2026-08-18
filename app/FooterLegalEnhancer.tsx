"use client";

import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

export default function FooterLegalEnhancer(){
  const [footer,setFooter]=useState<Element|null>(null);

  useEffect(()=>{
    const refresh=()=>{
      const nextFooter=document.querySelector(".app-footer");
      setFooter(nextFooter);
      if(!nextFooter)return;

      const tagline=nextFooter.querySelector<HTMLParagraphElement>(":scope > p");
      if(tagline&&tagline.textContent!=="Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube."){
        tagline.textContent="Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.";
      }

      const brand=nextFooter.querySelector(".app-footer-brand");
      const version=nextFooter.querySelector(".footer-version-label");
      if(brand&&version&&brand.previousElementSibling!==version){
        nextFooter.insertBefore(version,brand);
      }
    };
    refresh();
    const observer=new MutationObserver(()=>refresh());
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  if(!footer)return null;
  const year=new Date().getFullYear();

  return createPortal(<>
    <nav className="footer-legal-links" aria-label="Νομικές πληροφορίες">
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="/contact">Contact</a>
    </nav>
    <span className="footer-copyright">© {year} GreekTube Subs</span>
    <style>{`
      .app-footer .footer-version-label{
        margin:0 0 10px!important;
        min-height:27px!important;
        padding:0 10px!important;
        order:initial!important;
      }
      .app-footer .footer-legal-links{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:12px;
        margin-top:16px;
        margin-bottom:3px;
      }
      .app-footer .footer-legal-links a{
        color:#777d88;
        font-size:12px;
        line-height:1.35;
        text-decoration:none;
        transition:color .15s ease;
      }
      .app-footer .footer-legal-links a:hover,
      .app-footer .footer-legal-links a:focus-visible{
        color:#9a91df;
      }
      .app-footer .footer-copyright{
        display:block;
        color:#4f5562;
        font-size:11px;
        line-height:1.4;
        letter-spacing:.01em;
      }
      @media(max-width:620px){
        .app-footer .footer-version-label{margin-bottom:9px!important}
        .app-footer .footer-legal-links{gap:12px;margin-top:16px;margin-bottom:3px}
        .app-footer .footer-legal-links a{font-size:12px}
        .app-footer .footer-copyright{font-size:11px}
      }
    `}</style>
  </>,footer);
}
