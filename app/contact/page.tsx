import Link from "next/link";
import {APP_VERSION} from "../version";

export const metadata={
  title:"Επικοινωνία · GreekTube Subs",
  description:"Επικοινώνησε με το GreekTube Subs για υποστήριξη, feedback, απόρρητο ή θέματα περιεχομένου.",
};

const EMAIL="contact@greektubesubs.com";

function MailIcon(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="m4 7.5 8 6 8-6"/></svg>;
}
function ArrowIcon(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>;
}
function SupportIcon(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="M8.6 10a3.5 3.5 0 0 1 6.8 1.1c0 2.4-3.4 2.4-3.4 4M12 18h.01"/></svg>;
}
function ShieldIcon(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
}
function VideoIcon(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>;
}

export default function ContactPage(){
  const year=new Date().getFullYear();
  return <main className="contact-page">
    <div className="contact-atmosphere" aria-hidden="true"><i/><i/><i/></div>

    <header className="contact-header">
      <Link href="/" className="contact-brand" aria-label="GreekTube Subs αρχική">
        <span className="contact-logo" aria-hidden="true"/>
        <span>GreekTube <b>Subs</b></span>
      </Link>
      <Link href="/" className="contact-back"><span>←</span> Επιστροφή</Link>
    </header>

    <section className="contact-hero">
      <div className="contact-hero-copy">
        <span className="contact-kicker"><i/> ΕΠΙΚΟΙΝΩΝΙΑ</span>
        <h1>Είμαστε εδώ<br/><em>όταν μας χρειάζεσαι.</em></h1>
        <p>Για τεχνική υποστήριξη, feedback, θέματα απορρήτου ή περιεχομένου μπορείς να επικοινωνήσεις απευθείας μαζί μας.</p>
        <div className="contact-actions">
          <a className="contact-primary" href={`mailto:${EMAIL}`}><MailIcon/><span>Στείλε email</span><ArrowIcon/></a>
          <a className="contact-email-link" href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </div>
      </div>

      <aside className="contact-email-card">
        <div className="contact-card-glow" aria-hidden="true"/>
        <span className="contact-card-label">DIRECT CONTACT</span>
        <div className="contact-card-icon"><MailIcon/></div>
        <h2>Μίλησε μαζί μας.</h2>
        <p>Ένα email αρκεί. Αν αφορά συγκεκριμένο βίντεο στείλε μας και το link για να ξέρουμε ακριβώς πού να κοιτάξουμε.</p>
        <a href={`mailto:${EMAIL}`}><span>{EMAIL}</span><ArrowIcon/></a>
      </aside>
    </section>

    <section className="contact-reasons" aria-label="Θέματα επικοινωνίας">
      <article>
        <div className="reason-icon"><SupportIcon/></div>
        <span>01</span>
        <h2>Τεχνική υποστήριξη</h2>
        <p>Κάτι δεν λειτουργεί όπως πρέπει; Περιέγραψέ μας το πρόβλημα και σε ποια συσκευή ή browser το βλέπεις.</p>
      </article>
      <article>
        <div className="reason-icon"><ShieldIcon/></div>
        <span>02</span>
        <h2>Απόρρητο & δεδομένα</h2>
        <p>Για ερωτήσεις ή αιτήματα σχετικά με προσωπικά δεδομένα και ιδιωτικότητα μπορείς να επικοινωνήσεις απευθείας μαζί μας.</p>
      </article>
      <article>
        <div className="reason-icon"><VideoIcon/></div>
        <span>03</span>
        <h2>Βίντεο & υπότιτλοι</h2>
        <p>Για αναφορά περιεχομένου, υπότιτλους ή δικαιώματα στείλε το YouTube link ή το αντίστοιχο link του GreekTube Subs.</p>
      </article>
    </section>

    <section className="contact-tip">
      <span className="contact-tip-mark">i</span>
      <div><strong>Για να βρίσκουμε πιο γρήγορα το θέμα</strong><p>Βάλε στο μήνυμα το link του βίντεο και μια σύντομη περιγραφή του προβλήματος. Αν αφορά συγκεκριμένο σημείο του βίντεο πρόσθεσε και το timestamp.</p></div>
    </section>

    <footer className="contact-footer">
      <div className="contact-footer-inner">
        <div className="contact-footer-branding">
          <span className="contact-version">Version {APP_VERSION}</span>
          <Link href="/" className="contact-footer-logo"><span className="contact-logo" aria-hidden="true"/><span>GreekTube <b>Subs</b></span></Link>
          <p>Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.</p>
        </div>
        <div className="contact-footer-right">
          <nav aria-label="Νομικές πληροφορίες"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav>
          <span>© {year} GreekTube Subs</span>
        </div>
      </div>
    </footer>

    <style>{`
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      .contact-page{position:relative;min-height:100dvh;overflow:hidden;background:#090b10;color:#f5f5f2;font-family:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
      .contact-atmosphere{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .contact-atmosphere:before{content:"";position:absolute;inset:68px 0 auto;height:520px;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.016) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.5),transparent 88%);opacity:.42}
      .contact-atmosphere i{position:absolute;border-radius:50%;filter:blur(1px)}
      .contact-atmosphere i:nth-child(1){width:560px;height:560px;left:-230px;top:90px;background:radial-gradient(circle,rgba(116,91,255,.17),rgba(116,91,255,0) 70%)}
      .contact-atmosphere i:nth-child(2){width:640px;height:640px;right:-260px;top:130px;background:radial-gradient(circle,rgba(63,95,255,.12),rgba(63,95,255,0) 70%)}
      .contact-atmosphere i:nth-child(3){width:420px;height:420px;left:52%;top:360px;background:radial-gradient(circle,rgba(148,117,255,.055),transparent 70%)}

      .contact-header{position:relative;z-index:4;height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 clamp(18px,4vw,54px);border-bottom:1px solid rgba(255,255,255,.07);background:rgba(9,11,16,.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
      .contact-brand,.contact-footer-logo{display:inline-flex;align-items:center;gap:9px;color:#f3f4f6;text-decoration:none;font-size:13px;font-weight:650;letter-spacing:-.025em}.contact-brand b,.contact-footer-logo b{color:#9b8ef8;font-weight:630}.contact-logo{width:25px;height:25px;display:block;background:transparent url('/gtslogo.svg') center/contain no-repeat;filter:drop-shadow(0 4px 10px rgba(103,86,235,.22))}.contact-back{display:inline-flex;align-items:center;gap:7px;color:#838a95;text-decoration:none;font-size:10px;font-weight:600;transition:color .16s ease,transform .16s ease}.contact-back:hover{color:#d4d6dc;transform:translateX(-2px)}

      .contact-hero{position:relative;z-index:2;width:min(1180px,calc(100% - 40px));margin:0 auto;padding:clamp(72px,9vw,126px) 0 80px;display:grid;grid-template-columns:minmax(0,1.22fr) minmax(340px,.78fr);gap:clamp(48px,8vw,104px);align-items:center}
      .contact-hero-copy{max-width:680px}.contact-kicker{display:inline-flex;align-items:center;gap:9px;margin-bottom:19px;color:#a99df7;font-size:9px;font-weight:760;letter-spacing:.145em}.contact-kicker i{width:6px;height:6px;border-radius:50%;background:#8f7ff1;box-shadow:0 0 14px rgba(143,127,241,.8)}
      .contact-hero h1{margin:0;color:#f7f7f4;font-size:clamp(46px,6.5vw,78px);font-weight:680;line-height:.98;letter-spacing:-.058em}.contact-hero h1 em{color:#9e95e9;font-style:normal;font-weight:610}.contact-hero-copy>p{max-width:620px;margin:25px 0 0;color:#969ca7;font-size:clamp(14px,1.3vw,16px);line-height:1.72;letter-spacing:-.012em}
      .contact-actions{display:flex;align-items:center;gap:18px;margin-top:31px;flex-wrap:wrap}.contact-primary{height:48px;display:inline-flex;align-items:center;gap:10px;padding:0 17px;border:1px solid rgba(175,162,255,.42);border-radius:13px;background:linear-gradient(135deg,#786bdb,#6659c9);color:#fff;text-decoration:none;font-size:12px;font-weight:670;box-shadow:0 13px 32px rgba(83,67,184,.25),inset 0 1px 0 rgba(255,255,255,.14);transition:transform .16s ease,box-shadow .16s ease,background .16s ease}.contact-primary:hover{transform:translateY(-2px);background:linear-gradient(135deg,#8275e4,#6d61d2);box-shadow:0 17px 38px rgba(83,67,184,.32),inset 0 1px 0 rgba(255,255,255,.16)}.contact-primary svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.contact-primary svg:last-child{width:14px;height:14px;margin-left:4px}.contact-email-link{color:#8f96a2;text-decoration:none;font-family:var(--font-geist-mono),monospace;font-size:10.5px;transition:color .16s ease}.contact-email-link:hover{color:#bbb3f4}

      .contact-email-card{position:relative;isolation:isolate;min-height:360px;padding:33px 31px 29px;overflow:hidden;border:1px solid rgba(255,255,255,.105);border-radius:24px;background:linear-gradient(155deg,rgba(24,27,37,.9),rgba(14,16,22,.96));box-shadow:0 30px 80px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.035)}.contact-email-card:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(120deg,rgba(143,127,240,.08),transparent 42%)}.contact-card-glow{position:absolute;z-index:-1;width:260px;height:260px;right:-90px;top:-90px;border-radius:50%;background:radial-gradient(circle,rgba(130,111,239,.23),transparent 70%)}.contact-card-label{display:block;color:#716a9a;font-size:8px;font-weight:760;letter-spacing:.14em}.contact-card-icon{width:49px;height:49px;display:grid;place-items:center;margin:34px 0 25px;border:1px solid rgba(161,146,246,.28);border-radius:15px;background:rgba(143,127,240,.09);color:#b3a8f8;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.contact-card-icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}.contact-email-card h2{margin:0;color:#f0f1f3;font-size:25px;font-weight:650;letter-spacing:-.04em}.contact-email-card p{margin:12px 0 27px;color:#888f99;font-size:11.5px;line-height:1.68}.contact-email-card>a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);color:#b3a9f5;text-decoration:none;font-family:var(--font-geist-mono),monospace;font-size:10.5px}.contact-email-card>a svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .16s ease}.contact-email-card>a:hover svg{transform:translateX(3px)}

      .contact-reasons{position:relative;z-index:2;width:min(1180px,calc(100% - 40px));margin:0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-bottom:18px}.contact-reasons article{position:relative;min-height:250px;padding:25px 24px 24px;border:1px solid rgba(255,255,255,.075);border-radius:18px;background:rgba(17,20,27,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.018);transition:transform .18s ease,border-color .18s ease,background .18s ease}.contact-reasons article:hover{transform:translateY(-3px);border-color:rgba(143,127,240,.22);background:rgba(20,23,31,.79)}.contact-reasons article>span{position:absolute;right:19px;top:19px;color:#4f5561;font-family:var(--font-geist-mono),monospace;font-size:9px}.reason-icon{width:40px;height:40px;display:grid;place-items:center;margin-bottom:37px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);color:#8f86d9}.reason-icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}.contact-reasons h2{margin:0 0 9px;color:#e8e9ec;font-size:14px;font-weight:650;letter-spacing:-.025em}.contact-reasons p{margin:0;color:#838a95;font-size:10.8px;line-height:1.7}

      .contact-tip{position:relative;z-index:2;width:min(1180px,calc(100% - 40px));margin:12px auto 92px;display:grid;grid-template-columns:38px 1fr;gap:15px;align-items:start;padding:20px 22px;border:1px solid rgba(143,127,240,.14);border-radius:16px;background:linear-gradient(90deg,rgba(143,127,240,.055),rgba(143,127,240,.018))}.contact-tip-mark{width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(143,127,240,.24);border-radius:10px;color:#a49aef;font-family:Georgia,serif;font-size:15px;font-style:italic}.contact-tip strong{display:block;margin-top:1px;color:#cbcdd2;font-size:11.5px;font-weight:650}.contact-tip p{margin:5px 0 0;color:#777e89;font-size:10.5px;line-height:1.6}

      .contact-footer{position:relative;z-index:2;border-top:1px solid rgba(255,255,255,.07);background:#080a0e}.contact-footer-inner{width:min(1180px,calc(100% - 40px));min-height:190px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:40px;padding:34px 0}.contact-footer-branding{display:flex;flex-direction:column;align-items:flex-start}.contact-version{display:inline-flex;align-items:center;min-height:26px;margin-bottom:13px;padding:0 9px;border:1px solid rgba(255,255,255,.085);border-radius:999px;color:#707680;font-family:var(--font-geist-mono),monospace;font-size:8px}.contact-footer-logo{font-size:14px}.contact-footer-branding p{max-width:440px;margin:10px 0 0;color:#5d646f;font-size:10px;line-height:1.55}.contact-footer-right{text-align:right}.contact-footer-right nav{display:flex;justify-content:flex-end;gap:14px;margin-bottom:10px}.contact-footer-right a{color:#777d88;text-decoration:none;font-size:11px;transition:color .15s ease}.contact-footer-right a:hover{color:#a39aeb}.contact-footer-right>span{color:#4f5562;font-size:10px}

      @media(max-width:860px){.contact-hero{grid-template-columns:1fr;gap:42px;padding-top:70px}.contact-hero-copy{max-width:720px}.contact-email-card{min-height:310px}.contact-reasons{grid-template-columns:1fr}.contact-reasons article{min-height:205px}.reason-icon{margin-bottom:27px}.contact-tip{margin-bottom:70px}}
      @media(max-width:620px){.contact-header{height:62px;padding:0 15px}.contact-brand{font-size:12.5px}.contact-back{font-size:9.5px}.contact-hero{width:min(100% - 28px,1180px);padding:54px 0 48px;gap:33px}.contact-kicker{margin-bottom:15px}.contact-hero h1{font-size:clamp(40px,13vw,56px);line-height:1.01}.contact-hero-copy>p{margin-top:19px;font-size:13px;line-height:1.65}.contact-actions{display:grid;gap:13px;margin-top:24px}.contact-primary{width:100%;justify-content:center;height:49px}.contact-primary svg:last-child{margin-left:auto}.contact-email-link{text-align:center;font-size:10px}.contact-email-card{min-height:0;padding:25px 22px 23px;border-radius:19px}.contact-card-icon{margin:27px 0 20px}.contact-email-card h2{font-size:22px}.contact-email-card p{font-size:11.2px}.contact-email-card>a{font-size:9.6px}.contact-reasons{width:min(100% - 28px,1180px);gap:9px}.contact-reasons article{min-height:0;padding:21px 20px;border-radius:16px}.reason-icon{margin-bottom:24px}.contact-reasons h2{font-size:13.5px}.contact-reasons p{font-size:11px}.contact-tip{width:min(100% - 28px,1180px);grid-template-columns:32px 1fr;gap:12px;margin:11px auto 54px;padding:17px}.contact-tip-mark{width:30px;height:30px}.contact-tip p{font-size:10.3px}.contact-footer-inner{width:min(100% - 28px,1180px);display:block;min-height:0;padding:38px 0;text-align:center}.contact-footer-branding{align-items:center}.contact-footer-branding p{max-width:310px}.contact-footer-right{margin-top:26px;text-align:center}.contact-footer-right nav{justify-content:center;margin-bottom:10px}}
      @media(prefers-reduced-motion:reduce){.contact-primary,.contact-reasons article,.contact-back,.contact-email-card>a svg{transition:none}}
    `}</style>
  </main>;
}
