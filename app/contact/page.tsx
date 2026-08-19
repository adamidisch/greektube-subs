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

export default function ContactPage(){
  const year=new Date().getFullYear();

  return <main className="contact-page">
    <header className="contact-header">
      <Link href="/" className="contact-brand" aria-label="GreekTube Subs αρχική">
        <span className="contact-logo" aria-hidden="true"/>
        <span>GreekTube <b>Subs</b></span>
      </Link>
      <Link href="/" className="contact-back">← Επιστροφή</Link>
    </header>

    <section className="contact-shell">
      <div className="contact-intro">
        <span className="contact-kicker">CONTACT</span>
        <h1>Επικοινωνία</h1>
        <p>Για υποστήριξη, feedback, θέματα απορρήτου ή περιεχομένου μπορείς να επικοινωνήσεις απευθείας μαζί μας.</p>
      </div>

      <section className="contact-card" aria-label="Email επικοινωνίας">
        <div className="contact-card-main">
          <span className="contact-card-eyebrow">EMAIL</span>
          <h2>{EMAIL}</h2>
          <p>Στείλε μας το μήνυμά σου και αν αφορά συγκεκριμένο βίντεο πρόσθεσε το link ή το timestamp ώστε να εντοπίσουμε γρηγορότερα το θέμα.</p>
        </div>
        <a href={`mailto:${EMAIL}`} className="contact-mail-button">
          <MailIcon/>
          <span>Στείλε email</span>
          <ArrowIcon/>
        </a>
      </section>

      <section className="contact-grid" aria-label="Θέματα επικοινωνίας">
        <article>
          <span>01</span>
          <h2>Τεχνική υποστήριξη</h2>
          <p>Για bugs, προβλήματα αναπαραγωγής, υπότιτλους ή οτιδήποτε δεν λειτουργεί όπως πρέπει.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Απόρρητο</h2>
          <p>Για ερωτήσεις ή αιτήματα σχετικά με προσωπικά δεδομένα και ιδιωτικότητα.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Περιεχόμενο</h2>
          <p>Για αναφορές βίντεο, δικαιώματα περιεχομένου ή θέματα που αφορούν συγκεκριμένο YouTube link.</p>
        </article>
      </section>

      <section className="contact-note">
        <div className="contact-note-dot"/>
        <div>
          <strong>Για πιο γρήγορη εξυπηρέτηση</strong>
          <p>Αν το μήνυμα αφορά συγκεκριμένο βίντεο βάλε το link του GreekTube Subs ή του YouTube και μια σύντομη περιγραφή του θέματος.</p>
        </div>
      </section>
    </section>

    <footer className="contact-footer">
      <div className="contact-footer-line"/>
      <div className="contact-footer-inner">
        <div className="contact-footer-left">
          <Link href="/" className="contact-footer-logo" aria-label="GreekTube Subs αρχική">
            <span className="contact-logo" aria-hidden="true"/>
            <span>GreekTube <b>Subs</b></span>
          </Link>
          <p>Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.</p>
          <p className="contact-made">Φτιαγμένο με <span>♥</span> για ελληνόφωνους θεατές</p>
        </div>
        <div className="contact-footer-right">
          <nav aria-label="Νομικές πληροφορίες"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav>
          <div className="contact-meta"><small>© {year} GreekTube Subs</small><span aria-hidden="true">·</span><small>Version {APP_VERSION}</small></div>
        </div>
      </div>
    </footer>

    <style>{`
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      .contact-page{min-height:100dvh;background:linear-gradient(180deg,#0c0e13 0%,#090b0f 58%,#08090c 100%);color:#f3f1eb;font-family:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
      .contact-header{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,4vw,52px);border-bottom:1px solid rgba(255,255,255,.065)}
      .contact-brand,.contact-footer-logo{display:inline-flex;align-items:center;gap:9px;color:#f5f3ee;text-decoration:none;font-size:13px;font-weight:650;letter-spacing:-.02em}.contact-brand b,.contact-footer-logo b{color:#9d8ff5;font-weight:650}.contact-logo{width:25px;height:25px;display:block;background:url('/gtslogo.svg') center/contain no-repeat}.contact-back{color:#737986;text-decoration:none;font-size:10px;font-weight:600;transition:color .15s ease}.contact-back:hover{color:#c4c7cd}

      .contact-shell{width:min(820px,calc(100% - 40px));margin:0 auto;padding:88px 0 96px}.contact-intro{max-width:690px;margin-bottom:42px}.contact-kicker{display:block;margin-bottom:15px;color:#9389d8;font-size:9px;font-weight:760;letter-spacing:.16em}.contact-intro h1{margin:0;color:#f7f5ef;font-size:clamp(43px,6vw,68px);font-weight:670;line-height:1;letter-spacing:-.055em}.contact-intro p{max-width:620px;margin:20px 0 0;color:#969ba5;font-size:14px;line-height:1.72;letter-spacing:-.01em}

      .contact-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:30px;align-items:center;padding:29px 30px;border:1px solid rgba(255,255,255,.09);border-radius:19px;background:linear-gradient(145deg,rgba(25,28,36,.86),rgba(16,18,24,.88));box-shadow:0 22px 55px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.025)}.contact-card-eyebrow{display:block;margin-bottom:10px;color:#6f7480;font-size:8px;font-weight:740;letter-spacing:.15em}.contact-card h2{margin:0;color:#ece9e2;font-family:var(--font-geist-mono),monospace;font-size:16px;font-weight:560;letter-spacing:-.025em}.contact-card p{max-width:560px;margin:11px 0 0;color:#858b96;font-size:11.5px;line-height:1.65}.contact-mail-button{height:44px;display:inline-flex;align-items:center;gap:9px;padding:0 15px;border:1px solid rgba(157,143,245,.32);border-radius:11px;background:rgba(126,111,219,.13);color:#c3baf8;text-decoration:none;font-size:11px;font-weight:650;white-space:nowrap;transition:background .16s ease,border-color .16s ease,transform .16s ease}.contact-mail-button:hover{transform:translateY(-1px);background:rgba(126,111,219,.2);border-color:rgba(157,143,245,.47)}.contact-mail-button svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.contact-mail-button svg:last-child{width:13px;height:13px;margin-left:3px}

      .contact-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.contact-grid article{min-height:184px;padding:20px 19px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(17,19,25,.58)}.contact-grid article>span{display:block;margin-bottom:36px;color:#5f6570;font-family:var(--font-geist-mono),monospace;font-size:8px}.contact-grid h2{margin:0 0 8px;color:#dfe0e3;font-size:12.5px;font-weight:650;letter-spacing:-.02em}.contact-grid p{margin:0;color:#7f8691;font-size:10.5px;line-height:1.65}

      .contact-note{display:grid;grid-template-columns:8px 1fr;gap:14px;margin-top:12px;padding:18px 20px;border:1px solid rgba(157,143,245,.12);border-radius:14px;background:rgba(157,143,245,.025)}.contact-note-dot{width:5px;height:5px;margin-top:6px;border-radius:50%;background:#9389d8;box-shadow:0 0 12px rgba(147,137,216,.5)}.contact-note strong{display:block;color:#c7c9ce;font-size:11px;font-weight:650}.contact-note p{margin:5px 0 0;color:#757c87;font-size:10.5px;line-height:1.6}

      .contact-footer{background:linear-gradient(180deg,#111621 0%,#0d121b 100%);padding:42px 0 30px;border-top:1px solid rgba(255,255,255,.045)}.contact-footer-line{height:1px;width:100%;margin-bottom:30px;background:linear-gradient(90deg,transparent 8%,rgba(143,124,246,.5) 50%,transparent 92%)}.contact-footer-inner{width:min(1040px,calc(100% - 40px));margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:48px}.contact-footer-left{display:flex;flex-direction:column;align-items:flex-start;min-width:0}.contact-footer-logo{font-size:15px;margin-bottom:12px}.contact-footer-logo .contact-logo{width:30px;height:24px}.contact-footer-left>p{margin:0 0 6px;max-width:360px;color:#8b9099;font-size:12.5px;line-height:1.5;text-align:left}.contact-footer-left .contact-made{margin:0;color:#5f6570;font-size:11.5px}.contact-made span{color:#9d8ff5}.contact-footer-right{display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;min-width:max-content;padding-bottom:1px}.contact-footer nav{display:flex;justify-content:flex-end;gap:14px;margin-bottom:9px}.contact-footer nav a{color:#838995;font-size:12px;text-decoration:none;transition:color .15s ease}.contact-footer nav a:hover{color:#b5acf1}.contact-meta{display:flex;align-items:center;justify-content:flex-end;gap:7px;color:#59606c}.contact-meta small{color:#59606c;font-size:10.5px;letter-spacing:.01em}.contact-meta>span{font-size:9px;color:#454c58}

      @media(max-width:720px){.contact-shell{padding:58px 0 68px}.contact-card{grid-template-columns:1fr;padding:23px 21px;gap:21px}.contact-mail-button{width:100%;justify-content:center}.contact-grid{grid-template-columns:1fr}.contact-grid article{min-height:0;padding:19px}.contact-grid article>span{margin-bottom:23px}.contact-intro{margin-bottom:30px}}
      @media(max-width:620px){.contact-footer{padding:34px 0 27px}.contact-footer-line{margin-bottom:25px}.contact-footer-inner{width:min(100% - 32px,1040px);display:grid;grid-template-columns:1fr;gap:24px}.contact-footer-left{align-items:flex-start}.contact-footer-left>p{max-width:330px;text-align:left}.contact-footer-right{align-items:flex-start;min-width:0;width:100%;padding-top:20px;border-top:1px solid rgba(255,255,255,.06)}.contact-footer nav{justify-content:flex-start;gap:16px;margin-bottom:11px}.contact-meta{justify-content:flex-start;gap:6px;flex-wrap:wrap}.contact-meta small{font-size:10px}.contact-footer-logo{margin-bottom:10px}}
      @media(max-width:520px){.contact-header{height:62px;padding:0 15px}.contact-shell{width:min(100% - 28px,820px);padding-top:48px}.contact-intro h1{font-size:43px}.contact-intro p{font-size:13px}.contact-card h2{font-size:13px;overflow-wrap:anywhere}.contact-footer{padding-top:31px}.contact-footer-inner{width:calc(100% - 28px)}.contact-footer-left>p{font-size:11.5px}.contact-footer-left .contact-made{font-size:10.8px}.contact-footer nav a{font-size:11.5px}}
    `}</style>
  </main>;
}
