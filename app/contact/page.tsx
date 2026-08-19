import Link from "next/link";
import GtsFooter from "../GtsFooter";

export const metadata={
  title:"Επικοινωνία · GreekTube Subs",
  description:"Επικοινώνησε με το GreekTube Subs για υποστήριξη, feedback, απόρρητο ή θέματα περιεχομένου.",
};

const EMAIL="contact@greektubesubs.com";

function MailIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="m4 7.5 8 6 8-6"/></svg>}
function ArrowIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>}

export default function ContactPage(){
  return <main className="contact-page">
    <header className="contact-header">
      <Link href="/" className="contact-brand" aria-label="GreekTube Subs αρχική"><span className="contact-logo" aria-hidden="true"/><span>GreekTube <b>Subs</b></span></Link>
      <Link href="/" className="contact-back">← Επιστροφή</Link>
    </header>

    <section className="contact-shell">
      <div className="contact-intro"><span className="contact-kicker">CONTACT</span><h1>Επικοινωνία</h1><p>Για υποστήριξη, feedback, θέματα απορρήτου ή περιεχομένου μπορείς να επικοινωνήσεις απευθείας μαζί μας.</p></div>

      <section className="contact-card" aria-label="Email επικοινωνίας">
        <div className="contact-card-main"><span className="contact-card-eyebrow">EMAIL</span><h2>{EMAIL}</h2><p>Στείλε μας το μήνυμά σου και αν αφορά συγκεκριμένο βίντεο πρόσθεσε το link ή το timestamp ώστε να εντοπίσουμε γρηγορότερα το θέμα.</p></div>
        <a href={`mailto:${EMAIL}`} className="contact-mail-button"><MailIcon/><span>Στείλε email</span><ArrowIcon/></a>
      </section>

      <section className="contact-grid" aria-label="Θέματα επικοινωνίας">
        <article><span>01</span><h2>Τεχνική υποστήριξη</h2><p>Για bugs, προβλήματα αναπαραγωγής, υπότιτλους ή οτιδήποτε δεν λειτουργεί όπως πρέπει.</p></article>
        <article><span>02</span><h2>Απόρρητο</h2><p>Για ερωτήσεις ή αιτήματα σχετικά με προσωπικά δεδομένα και ιδιωτικότητα.</p></article>
        <article><span>03</span><h2>Περιεχόμενο</h2><p>Για αναφορές βίντεο, δικαιώματα περιεχομένου ή θέματα που αφορούν συγκεκριμένο YouTube link.</p></article>
      </section>

      <section className="contact-note"><div className="contact-note-dot"/><div><strong>Για πιο γρήγορη εξυπηρέτηση</strong><p>Αν το μήνυμα αφορά συγκεκριμένο βίντεο βάλε το link του GreekTube Subs ή του YouTube και μια σύντομη περιγραφή του θέματος.</p></div></section>
    </section>

    <GtsFooter/>

    <style>{`
      :root{color-scheme:dark}*{box-sizing:border-box}.contact-page{min-height:100dvh;padding-bottom:24px;background:linear-gradient(180deg,#0c0e13 0%,#090b0f 58%,#08090c 100%);color:#f3f1eb;font-family:var(--font-ui),var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.contact-header{height:74px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,4vw,56px);border-bottom:1px solid rgba(255,255,255,.065)}.contact-brand{display:inline-flex;align-items:center;gap:10px;color:#f5f3ee;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:-.02em}.contact-brand b{color:#9d8ff5}.contact-logo{width:28px;height:28px;display:block;background:url('/gtslogo.svg') center/contain no-repeat}.contact-back{color:#8d939e;text-decoration:none;font-size:14px;font-weight:600}.contact-back:hover{color:#d5d7dc}.contact-shell{width:min(930px,calc(100% - 44px));margin:0 auto;padding:86px 0 88px}.contact-intro{max-width:760px;margin-bottom:45px}.contact-kicker{display:block;margin-bottom:16px;color:#9b90e6;font-size:12px;font-weight:780;letter-spacing:.16em}.contact-intro h1{margin:0;color:#f7f5ef;font-size:clamp(50px,6vw,72px);font-weight:690;line-height:1;letter-spacing:-.055em}.contact-intro p{max-width:720px;margin:23px 0 0;color:#a7acb5;font-size:18px;line-height:1.62}.contact-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:34px;align-items:center;padding:34px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:linear-gradient(145deg,rgba(25,28,36,.9),rgba(16,18,24,.9));box-shadow:0 24px 58px rgba(0,0,0,.22)}.contact-card-eyebrow{display:block;margin-bottom:12px;color:#818793;font-size:11px;font-weight:760;letter-spacing:.15em}.contact-card h2{margin:0;color:#ece9e2;font-family:var(--font-geist-mono),monospace;font-size:19px;font-weight:600;letter-spacing:-.025em}.contact-card p{max-width:590px;margin:13px 0 0;color:#9298a3;font-size:15px;line-height:1.65}.contact-mail-button{height:48px;display:inline-flex;align-items:center;gap:10px;padding:0 17px;border:1px solid rgba(157,143,245,.34);border-radius:12px;background:rgba(126,111,219,.14);color:#c7bffa;text-decoration:none;font-size:14px;font-weight:680;white-space:nowrap}.contact-mail-button:hover{background:rgba(126,111,219,.22)}.contact-mail-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.contact-mail-button svg:last-child{width:14px;height:14px;margin-left:3px}.contact-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}.contact-grid article{min-height:205px;padding:24px 22px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(17,19,25,.62)}.contact-grid article>span{display:block;margin-bottom:38px;color:#666d78;font-family:var(--font-geist-mono),monospace;font-size:10px}.contact-grid h2{margin:0 0 10px;color:#e1e2e5;font-size:16px;font-weight:680;letter-spacing:-.02em}.contact-grid p{margin:0;color:#8b929e;font-size:14px;line-height:1.65}.contact-note{display:grid;grid-template-columns:9px 1fr;gap:15px;margin-top:14px;padding:21px 22px;border:1px solid rgba(157,143,245,.14);border-radius:15px;background:rgba(157,143,245,.035)}.contact-note-dot{width:6px;height:6px;margin-top:8px;border-radius:50%;background:#9389d8}.contact-note strong{display:block;color:#d0d2d7;font-size:14px;font-weight:680}.contact-note p{margin:6px 0 0;color:#858c97;font-size:13.5px;line-height:1.6}@media(max-width:760px){.contact-shell{padding:58px 0 66px}.contact-card{grid-template-columns:1fr;padding:25px 22px;gap:23px}.contact-mail-button{width:100%;justify-content:center}.contact-grid{grid-template-columns:1fr}.contact-grid article{min-height:0;padding:22px}.contact-grid article>span{margin-bottom:24px}.contact-intro p{font-size:16px}}@media(max-width:520px){.contact-header{height:64px;padding:0 15px}.contact-brand{font-size:14px}.contact-back{font-size:12.5px}.contact-shell{width:calc(100% - 28px);padding-top:48px}.contact-intro h1{font-size:44px}.contact-intro p{font-size:15.5px}.contact-card h2{font-size:16px;overflow-wrap:anywhere}.contact-card p,.contact-grid p{font-size:13.5px}}
    `}</style>
  </main>;
}
