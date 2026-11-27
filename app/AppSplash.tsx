/* Άμεσο splash (server component, χωρίς JS): καλύπτει την εφαρμογή μέχρι να είναι έτοιμη, ώστε ο χρήστης να μη βλέπει
   skeleton, αλλαγές θέματος ή στοιχεία που μετακινούνται. Κρύβεται όταν το GreekTubePlayer βάλει data-app-ready στο <html>. */
const SPLASH_CSS = `
#gt-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0b0c0f;color:#e9eaf0;opacity:1;transition:opacity .3s ease,visibility 0s linear .3s}
html[data-theme="light"] #gt-splash{background:#f5f2ed;color:#1c1e23}
html[data-app-ready] #gt-splash{opacity:0;visibility:hidden;pointer-events:none}
#gt-splash img{display:block;width:56px;height:56px;border-radius:14px}
#gt-splash .gt-splash-name{font:600 16px/1 Inter,system-ui,sans-serif;letter-spacing:-.01em}
#gt-splash .gt-splash-name b{font-weight:600;color:#8f7ff0}
#gt-splash .gt-splash-bar{position:relative;width:96px;height:3px;border-radius:2px;overflow:hidden;background:rgba(128,128,150,.22)}
#gt-splash .gt-splash-bar::after{content:"";position:absolute;inset:0;width:40%;border-radius:2px;background:#8f7ff0;animation:gtSplashBar 1.1s ease-in-out infinite}
@keyframes gtSplashBar{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){#gt-splash{transition:none}#gt-splash .gt-splash-bar::after{animation:none;width:100%;opacity:.5}}
`;

export default function AppSplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <noscript><style>{"#gt-splash{display:none!important}"}</style></noscript>
      <div id="gt-splash" role="status" aria-label="Φόρτωση">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gtslogo.svg?v=7820" alt="" width={56} height={56} />
        <span className="gt-splash-name">GreekTube <b>Subs</b></span>
        <i className="gt-splash-bar" aria-hidden="true" />
      </div>
    </>
  );
}
