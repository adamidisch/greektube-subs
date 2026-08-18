import Link from "next/link";
import type {ReactNode} from "react";

type LegalPageProps={
  eyebrow:string;
  title:string;
  intro:string;
  children:ReactNode;
};

export default function LegalPage({eyebrow,title,intro,children}:LegalPageProps){
  return <main className="legal-page">
    <header className="legal-header">
      <Link href="/" className="legal-brand" aria-label="GreekTube Subs αρχική">
        <span className="legal-logo" aria-hidden="true"/>
        <span>GreekTube <b>Subs</b></span>
      </Link>
      <Link href="/" className="legal-back">← Επιστροφή</Link>
    </header>

    <article className="legal-shell">
      <div className="legal-heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
        <small>Τελευταία ενημέρωση: 18 Αυγούστου 2026</small>
      </div>
      <div className="legal-content">{children}</div>
    </article>

    <footer className="legal-footer">
      <span>© {new Date().getFullYear()} GreekTube Subs</span>
      <nav>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </footer>

    <style>{`
      :root{color-scheme:dark}.legal-page{min-height:100dvh;background:#090b0f;color:#f1f2f4;font-family:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.legal-header{height:68px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 clamp(18px,4vw,52px);border-bottom:1px solid rgba(255,255,255,.075);background:rgba(9,11,15,.93);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.legal-brand{display:flex;align-items:center;gap:9px;color:#f3f4f6;text-decoration:none;font-size:13px;font-weight:630;letter-spacing:-.02em}.legal-brand b{color:#9b8ef8;font-weight:620}.legal-logo{width:24px;height:24px;display:block;background:transparent url('/gtslogo.svg') center/contain no-repeat}.legal-back{color:#8d939d;text-decoration:none;font-size:10px;font-weight:600}.legal-back:hover{color:#c7cbd1}.legal-shell{width:min(820px,calc(100% - 32px));margin:0 auto;padding:58px 0 74px}.legal-heading{padding-bottom:30px;border-bottom:1px solid rgba(255,255,255,.08)}.legal-heading>span{display:block;margin-bottom:10px;color:#9589ef;font-size:8px;font-weight:760;letter-spacing:.13em}.legal-heading h1{margin:0;color:#f5f5f2;font-size:clamp(28px,5vw,46px);font-weight:690;letter-spacing:-.045em;line-height:1.05}.legal-heading p{max-width:680px;margin:16px 0 0;color:#9aa0a9;font-size:13px;line-height:1.7}.legal-heading small{display:block;margin-top:14px;color:#606772;font-size:9px}.legal-content{padding-top:12px}.legal-content section{padding:24px 0;border-bottom:1px solid rgba(255,255,255,.065)}.legal-content h2{margin:0 0 10px;color:#eceef1;font-size:15px;font-weight:650;letter-spacing:-.025em}.legal-content p,.legal-content li{color:#9298a2;font-size:11.5px;line-height:1.75}.legal-content p{margin:0}.legal-content p+p{margin-top:10px}.legal-content ul{margin:9px 0 0;padding-left:19px}.legal-content a{color:#a99ff4;text-decoration:none}.legal-content a:hover{text-decoration:underline}.legal-note{margin-top:16px!important;padding:13px 14px;border:1px solid rgba(143,127,240,.17);border-radius:12px;background:rgba(143,127,240,.055);color:#aba5d6!important}.legal-footer{min-height:88px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px clamp(18px,4vw,52px);border-top:1px solid rgba(255,255,255,.07);color:#505762;font-size:10px}.legal-footer nav{display:flex;gap:13px}.legal-footer a{color:#747b86;text-decoration:none}.legal-footer a:hover{color:#a49be8}@media(max-width:620px){.legal-header{height:62px;padding:0 15px}.legal-back{font-size:9.5px}.legal-shell{width:min(100% - 28px,820px);padding:40px 0 56px}.legal-heading{padding-bottom:24px}.legal-heading p{font-size:12px;line-height:1.65}.legal-content section{padding:21px 0}.legal-content h2{font-size:14px}.legal-content p,.legal-content li{font-size:11.5px}.legal-footer{display:block;text-align:center}.legal-footer nav{justify-content:center;margin-top:10px}}
    `}</style>
  </main>;
}
