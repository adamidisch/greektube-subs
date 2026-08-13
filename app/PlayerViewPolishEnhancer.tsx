"use client";

import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

export default function PlayerViewPolishEnhancer(){
  const [shell,setShell]=useState<Element|null>(null);
  const [showFooter,setShowFooter]=useState(false);

  useEffect(()=>{
    const sync=()=>{
      const appShell=document.querySelector(".app-shell");
      const playerView=Boolean(document.querySelector(".watch-layout"));
      const existingFooter=Boolean(document.querySelector(".app-footer"));
      setShell(current=>current===appShell?current:appShell);
      setShowFooter(Boolean(appShell&&playerView&&!existingFooter));

      document.querySelectorAll<HTMLElement>('button[aria-label="Διαχείριση υποτίτλων"]').forEach(button=>{
        if((button.textContent||"").trim()==="CC")button.textContent="Subs";
      });
      document.querySelectorAll<HTMLElement>(".heading-actions .subtitle-manage>span").forEach(span=>{
        if((span.textContent||"").trim()==="CC")span.textContent="Subs";
      });
    };

    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    window.addEventListener("popstate",sync);
    return()=>{
      observer.disconnect();
      window.removeEventListener("popstate",sync);
    };
  },[]);

  if(!shell||!showFooter)return null;

  return createPortal(
    <footer className="app-footer player-view-footer">
      <div className="app-footer-brand">
        <span className="brand-mark"><i aria-hidden="true"/>▶</span>
        <span>GreekTube <b>Subs</b></span>
      </div>
      <p>Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.</p>
      <span className="app-footer-note">Φτιαγμένο με ♥ για ελληνόφωνους θεατές</span>
    </footer>,
    shell,
  );
}
