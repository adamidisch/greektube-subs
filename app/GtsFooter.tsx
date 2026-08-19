import Link from "next/link";
import {APP_VERSION} from "./version";

export default function GtsFooter(){
  const year=new Date().getFullYear();
  return <footer className="gts-standard-footer" aria-label="GreekTube Subs">
    <div className="gts-standard-footer-inner">
      <div className="gts-standard-footer-left">
        <Link href="/" className="gts-standard-footer-brand" aria-label="GreekTube Subs αρχική">
          <span className="gts-standard-footer-logo" aria-hidden="true"/>
          <span>GreekTube <b>Subs</b></span>
        </Link>
        <p className="gts-standard-footer-description">Αυτόματοι ελληνικοί υπότιτλοι με AI για δημόσια βίντεο YouTube.</p>
        <p className="gts-standard-footer-made">Φτιαγμένο με <b>♥</b> για ελληνόφωνους θεατές</p>
      </div>
      <div className="gts-standard-footer-right">
        <nav className="gts-standard-footer-nav" aria-label="Νομικές πληροφορίες">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="gts-standard-footer-meta">
          <span>© {year} GreekTube Subs</span><i aria-hidden="true">·</i><span>Version {APP_VERSION}</span>
        </div>
      </div>
    </div>
  </footer>;
}
