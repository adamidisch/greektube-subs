"use client";

export default function EditorProductionPolishEnhancer(){
  return <style>{`
    .gts-editor-title .gts-editor-kicker{font-size:0!important}
    .gts-editor-title .gts-editor-kicker::after{
      content:"VIDEO EDITOR";
      font-size:12px;
      font-weight:600;
      letter-spacing:.14em;
    }
  `}</style>;
}
