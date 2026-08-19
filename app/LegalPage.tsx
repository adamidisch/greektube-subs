import Link from "next/link";
import type {ReactNode} from "react";
import GtsFooter from "./GtsFooter";

type LegalPageProps={eyebrow:string;title:string;intro:string;children:ReactNode};

export default function LegalPage({eyebrow,title,intro,children}:LegalPageProps){
  return <main className="legal-page">
    <header className="legal-header">
      <Link href="/" className="legal-brand" aria-label="GreekTube Subs αρχική"><span className="legal-logo" aria-hidden="true"/><span>GreekTube <b>Subs</b></span></Link>
      <Link href="/" className="legal-back">← Επιστροφή</Link>
    </header>

    <article className="legal-shell">
      <div className="legal-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Τελευταία ενημέρωση: 18 Αυγούστου 2026</small></div>
      <div className="legal-content">{children}</div>
    </article>

    <GtsFooter/>

    <style>{`
      :root{color-scheme:dark}.legal-page{min-height:100dvh;padding-bottom:24px;background:#090b0f;color:#f1f2f4;font-family:var(--font-ui),var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.legal-header{height:74px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 clamp(20px,4vw,56px);border-bottom:1px solid rgba(255,255,255,.075);background:rgba(9,11,15,.93);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.legal-brand{display:flex;align-items:center;gap:10px;color:#f3f4f6;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:-.02em}.legal-brand b{color:#9b8ef8}.legal-logo{width:28px;height:28px;display:block;background:transparent url('/gtslogo.svg') center/contain no-repeat}.legal-back{color:#8f96a1;text-decoration:none;font-size:14px;font-weight:600}.legal-back:hover{color:#d0d3d8}.legal-shell{width:min(900px,calc(100% - 40px));margin:0 auto;padding:68px 0 82px}.legal-heading{padding-bottom:34px;border-bottom:1px solid rgba(255,255,255,.08)}.legal-heading>span{display:block;margin-bottom:13px;color:#9b90ed;font-size:11px;font-weight:780;letter-spacing:.14em}.legal-heading h1{margin:0;color:#f5f5f2;font-size:clamp(38px,5vw,56px);font-weight:700;letter-spacing:-.048em;line-height:1.04}.legal-heading p{max-width:760px;margin:20px 0 0;color:#a2a8b1;font-size:17px;line-height:1.65}.legal-heading small{display:block;margin-top:17px;color:#6f7681;font-size:12.5px}.legal-content{padding-top:12px}.legal-content section{padding:30px 0;border-bottom:1px solid rgba(255,255,255,.065)}.legal-content h2{margin:0 0 13px;color:#eceef1;font-size:20px;font-weight:680;letter-spacing:-.025em}.legal-content p,.legal-content li{color:#9aa0aa;font-size:15px;line-height:1.75}.legal-content p{margin:0}.legal-content p+p{margin-top:12px}.legal-content ul{margin:11px 0 0;padding-left:22px}.legal-content a{color:#aea4f6;text-decoration:none}.legal-content a:hover{text-decoration:underline}.legal-note{margin-top:18px!important;padding:16px 17px;border:1px solid rgba(143,127,240,.18);border-radius:13px;background:rgba(143,127,240,.06);color:#b8b2df!important}@media(max-width:620px){.legal-header{height:64px;padding:0 15px}.legal-brand{font-size:14px}.legal-back{font-size:12.5px}.legal-shell{width:calc(100% - 28px);padding:48px 0 60px}.legal-heading{padding-bottom:27px}.legal-heading h1{font-size:38px}.legal-heading p{font-size:15.5px;line-height:1.65}.legal-content section{padding:25px 0}.legal-content h2{font-size:18px}.legal-content p,.legal-content li{font-size:14px}}
    `}</style>
  </main>;
}
