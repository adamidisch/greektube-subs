import Link from "next/link";
import GtsFooter from "../GtsFooter";

export const metadata={
  title:"Επικοινωνία και βοήθεια · GreekTube Subs",
  description:"Επικοινωνία, υποστήριξη και απλή εξήγηση για το πώς λειτουργεί το GreekTube Subs.",
};

const CONTACT_EMAIL="contact@greektubesubs.com";
const SUPPORT_EMAIL="support@greektubesubs.com";

function MailIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="m4 7.5 8 6 8-6"/></svg>}
function ArrowIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>}

export default function ContactPage(){
  return <main className="contact-page">
    <header className="contact-header">
      <Link href="/" className="contact-brand" aria-label="GreekTube Subs αρχική"><span className="contact-logo" aria-hidden="true"/><span>GreekTube <b>Subs</b></span></Link>
      <Link href="/" className="contact-back">← Επιστροφή</Link>
    </header>

    <section className="contact-shell">
      <section className="contact-hero">
        <span className="contact-kicker">CONTACT · HELP</span>
        <h1>Επικοινωνία και βοήθεια</h1>
        <p>Για γενικές ερωτήσεις, feedback ή βοήθεια με κάποιο βίντεο μπορείς να μας στείλεις απευθείας email. Παρακάτω θα βρεις επίσης μια απλή εξήγηση για το πώς λειτουργεί το GreekTube Subs.</p>
      </section>

      <section className="email-grid" aria-label="Email επικοινωνίας και υποστήριξης">
        <article className="email-card email-card-contact">
          <div className="email-card-top"><span className="email-icon"><MailIcon/></span><span className="email-type">CONTACT</span></div>
          <div className="email-card-copy"><h2>Επικοινωνία</h2><p>Για γενικές ερωτήσεις, feedback και οτιδήποτε αφορά το GreekTube Subs.</p></div>
          <a href={`mailto:${CONTACT_EMAIL}`} className="email-address"><span>{CONTACT_EMAIL}</span><ArrowIcon/></a>
        </article>

        <article className="email-card email-card-support">
          <div className="email-card-top"><span className="email-icon"><MailIcon/></span><span className="email-type">SUPPORT</span></div>
          <div className="email-card-copy"><h2>Υποστήριξη</h2><p>Αν κάτι δεν λειτουργεί σωστά, αν λείπουν υπότιτλοι ή αν χρειάζεσαι βοήθεια με συγκεκριμένο βίντεο.</p></div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="email-address"><span>{SUPPORT_EMAIL}</span><ArrowIcon/></a>
          <small>Για συγκεκριμένο βίντεο στείλε μαζί το link και αν χρειάζεται το σημείο του video.</small>
        </article>
      </section>

      <section className="help-section" aria-labelledby="how-it-works">
        <div className="help-heading"><span className="help-kicker">HELP</span><div><h2 id="how-it-works">Πώς λειτουργεί το GreekTube Subs</h2><p>Χωρίς τεχνικές λεπτομέρειες. Η βασική διαδικασία είναι αυτή:</p></div></div>

        <div className="help-flow">
          <article><span className="help-number">01</span><div><h3>Βάζεις το YouTube link</h3><p>Ανοίγεις ένα δημόσιο YouTube βίντεο μέσα από το GreekTube Subs.</p></div></article>
          <article><span className="help-number">02</span><div><h3>Βρίσκεται το διαθέσιμο κείμενο</h3><p>Το GreekTube Subs χρησιμοποιεί το διαθέσιμο κείμενο ή τους υπότιτλους που συνοδεύουν το βίντεο.</p></div></article>
          <article><span className="help-number">03</span><div><h3>Γίνεται η μετάφραση με AI</h3><p>Το κείμενο μεταφράζεται στα ελληνικά με AI και οργανώνεται ώστε να ακολουθεί σωστά τη ροή του βίντεο.</p></div></article>
          <article><span className="help-number">04</span><div><h3>Οι υπότιτλοι μπαίνουν στον player</h3><p>Όταν η μετάφραση είναι έτοιμη οι ελληνικοί υπότιτλοι φορτώνονται στον player. Αν το βίντεο έχει ήδη μεταφραστεί ανοίγει χωρίς να χρειάζεται νέα μετάφραση.</p></div></article>
        </div>

        <div className="help-note"><span aria-hidden="true">✦</span><p>Η μετάφραση γίνεται με AI και μπορεί περιστασιακά να υπάρχουν μικρές αστοχίες. Αν δεις κάτι που χρειάζεται διόρθωση μπορείς να μας το στείλεις στο support email.</p></div>
      </section>
    </section>

    <GtsFooter/>

    <style>{`
      :root{color-scheme:dark}*{box-sizing:border-box}.contact-page{min-height:100dvh;padding-bottom:0;background:radial-gradient(circle at 18% 10%,rgba(116,94,190,.08),transparent 31rem),linear-gradient(180deg,#0b0d12 0%,#090b0f 56%,#08090c 100%);color:#f3f1eb;font-family:var(--font-ui),var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.contact-header{height:70px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,4vw,54px);border-bottom:1px solid rgba(255,255,255,.055);background:rgba(8,10,14,.56);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.contact-brand{display:inline-flex;align-items:center;gap:9px;color:#f5f3ee;text-decoration:none;font-size:15.5px;font-weight:700;letter-spacing:-.02em}.contact-brand b{color:#9d8ff5}.contact-logo{width:28px;height:28px;display:block;background:url('/gtslogo.svg') center/contain no-repeat}.contact-back{min-height:36px;display:inline-flex;align-items:center;padding:0 11px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.025);color:#969ca7;text-decoration:none;font-size:12.5px;font-weight:620;transition:border-color .16s ease,background .16s ease,color .16s ease}.contact-back:hover{border-color:rgba(157,143,245,.24);background:rgba(157,143,245,.06);color:#d8d3f4}.contact-shell{width:min(1080px,calc(100% - 44px));margin:0 auto;padding:76px 0 56px}.contact-hero{max-width:830px;margin-bottom:38px}.contact-kicker,.help-kicker{display:block;color:#9d90ef;font-size:10px;font-weight:780;letter-spacing:.16em}.contact-kicker{margin-bottom:15px}.contact-hero h1{max-width:820px;margin:0;color:#f6f4ef;font-size:clamp(42px,5.6vw,68px);font-weight:700;line-height:1.02;letter-spacing:-.052em}.contact-hero p{max-width:790px;margin:20px 0 0;color:#a3a8b2;font-size:16.5px;line-height:1.68;letter-spacing:-.01em}.email-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.email-card{position:relative;min-width:0;min-height:276px;display:flex;flex-direction:column;padding:24px;border:1px solid rgba(255,255,255,.085);border-radius:19px;background:linear-gradient(145deg,rgba(28,31,40,.92),rgba(16,18,24,.94));box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 18px 48px rgba(0,0,0,.16);overflow:hidden}.email-card::after{content:"";position:absolute;right:-50px;top:-70px;width:180px;height:180px;border-radius:50%;pointer-events:none;filter:blur(4px)}.email-card-contact::after{background:radial-gradient(circle,rgba(132,110,234,.13),transparent 67%)}.email-card-support::after{background:radial-gradient(circle,rgba(71,164,186,.11),transparent 67%)}.email-card-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.email-icon{width:37px;height:37px;display:grid;place-items:center;border:1px solid rgba(157,143,245,.20);border-radius:11px;background:rgba(157,143,245,.075);color:#b6acf4}.email-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.email-card-support .email-icon{border-color:rgba(95,168,190,.20);background:rgba(95,168,190,.065);color:#8dc5d3}.email-type{color:#707784;font-family:var(--font-geist-mono),monospace;font-size:9px;font-weight:690;letter-spacing:.12em}.email-card-copy{position:relative;z-index:1;margin-top:31px}.email-card-copy h2{margin:0;color:#ecebe8;font-size:19px;font-weight:690;letter-spacing:-.025em}.email-card-copy p{max-width:440px;margin:9px 0 0;color:#9299a5;font-size:13.5px;line-height:1.58}.email-address{position:relative;z-index:1;min-width:0;height:43px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding:0 13px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(255,255,255,.035);color:#d8d9df;text-decoration:none;transition:border-color .16s ease,background .16s ease,transform .16s ease}.email-address:hover{transform:translateY(-1px);border-color:rgba(157,143,245,.30);background:rgba(157,143,245,.075)}.email-card-support .email-address:hover{border-color:rgba(95,168,190,.28);background:rgba(95,168,190,.065)}.email-address span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-geist-mono),monospace;font-size:12px}.email-address svg{width:14px;height:14px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.email-card small{position:relative;z-index:1;display:block;margin-top:10px;color:#6f7682;font-size:10.5px;line-height:1.45}.help-section{margin-top:58px;padding:34px;border:1px solid rgba(157,143,245,.105);border-radius:22px;background:linear-gradient(155deg,rgba(20,20,30,.92),rgba(13,16,22,.95));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.help-heading{display:grid;grid-template-columns:72px minmax(0,1fr);gap:22px;align-items:start;padding-bottom:26px;border-bottom:1px solid rgba(255,255,255,.065)}.help-kicker{padding-top:5px}.help-heading h2{margin:0;color:#f1efeb;font-size:27px;font-weight:700;letter-spacing:-.035em}.help-heading p{margin:7px 0 0;color:#838a96;font-size:13.5px;line-height:1.55}.help-flow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:10px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.035);border-radius:16px;overflow:hidden}.help-flow article{min-height:174px;display:grid;grid-template-columns:38px minmax(0,1fr);gap:16px;padding:24px;background:#11141a}.help-flow article:nth-child(2),.help-flow article:nth-child(3){background:#101319}.help-number{width:31px;height:24px;display:grid;place-items:center;border:1px solid rgba(157,143,245,.15);border-radius:8px;background:rgba(157,143,245,.055);color:#9188c9;font-family:var(--font-geist-mono),monospace;font-size:9px}.help-flow h3{margin:1px 0 8px;color:#dedfe2;font-size:14.5px;font-weight:670;letter-spacing:-.018em}.help-flow p{margin:0;color:#858c98;font-size:12.8px;line-height:1.62}.help-note{display:grid;grid-template-columns:24px minmax(0,1fr);gap:11px;align-items:start;margin-top:16px;padding:15px 16px;border:1px solid rgba(157,143,245,.11);border-radius:12px;background:rgba(157,143,245,.035);color:#8178c7}.help-note span{padding-top:1px;font-size:13px}.help-note p{margin:0;color:#858c98;font-size:12px;line-height:1.55}@media(max-width:760px){.contact-shell{padding:54px 0 42px}.contact-hero{margin-bottom:30px}.contact-hero p{font-size:15.5px}.email-grid{grid-template-columns:1fr}.email-card{min-height:248px}.help-section{margin-top:40px;padding:24px 20px;border-radius:18px}.help-heading{grid-template-columns:1fr;gap:10px;padding-bottom:21px}.help-kicker{padding-top:0}.help-heading h2{font-size:23px}.help-flow{grid-template-columns:1fr}.help-flow article{min-height:0;padding:21px 18px}.help-note{margin-top:13px}}@media(max-width:520px){.contact-header{height:62px;padding:0 14px}.contact-brand{font-size:14px}.contact-back{min-height:34px;padding:0 9px;font-size:11.5px}.contact-shell{width:calc(100% - 28px);padding-top:43px}.contact-hero h1{font-size:39px}.contact-hero p{font-size:14.5px;line-height:1.62}.email-card{padding:20px;border-radius:16px}.email-card-copy{margin-top:25px}.email-card-copy p{font-size:13px}.email-address span{font-size:11px}.help-section{padding:21px 16px}.help-flow article{grid-template-columns:34px minmax(0,1fr);gap:12px;padding:19px 15px}.help-flow h3{font-size:14px}.help-flow p{font-size:12.5px}}
    `}</style>
  </main>;
}
