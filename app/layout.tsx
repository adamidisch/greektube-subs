import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { APP_VERSION } from "./version";
import UserProfileEnhancer from "./UserProfileEnhancer";
import TooltipLayer from "./TooltipLayer";
import "./globals.css";
import "./mobile-controls-fix.css";
import "./ui-651.css";
import "./desktop-controls-final.css";
import "./content-areas-final.css";
import "./release-6.6.15.css";
import "./v7-4-0.css";
import "./v7-4-2.css";
import "./v7-4-9.css";
import "./v7-5-1.css";
import "./v7-5-3.css";
import "./v7-6-0.css";
import "./v7-6-1.css";
import "./claude-ui-v78.css";
import "./v7-8-9-design.css";
import "./v7-8-10-polish.css";
import "./v7-8-10-caption-icons.css";
import "./v7-8-11-light-polish.css";
/* Legacy absolute-position theme styles retired in v7.12.6. */
import "./v7-8-13-designerui.css";
import "./v7-8-13-reference-controls-footer.css";
import "./v7-8-15-modal-shell.css";
import "./v7-8-16-home-title-polish.css";
import "./v7-8-17-mobile-viewer-polish.css";
import "./brand.css";
import "./screen-isolation.css";
import "./v7-8-23-player-fullscreen-footer.css";
import "./mobile-controls-final.css";
import "./player-page-v7-8-30.css";
import "./player-page-v7-8-31.css";
import "./player-page-v7-8-32.css";
import "./player-page-v7-8-33.css";
import "./v7-8-38-footer-redesign.css";
import "./v7-8-39-editor-production.css";
import "./gts-footer.css";
import "./contact-footer-guard.css";
/* Retired v7.8.44 CSS-injected gear: canonical icon is rendered by React. */
import "./mobile-player-polish-7-8-44.css";
import "./release-lock-7-8-45.css";
import "./player-time-ui.css";
import "./audio-timing-capture.css";
import "./player-loading-polish.css";
import "./professional-workflow.css";
import "./player-controls-gts31-v7-12-2.css";
import "./home-loading-polish-v7-12-3.css";
import "./premium-header-watch-rail-v7-12-5.css";
import "./header-controls-v7-12-6.css";
import "./modal-scroll-v7-12-14.css";
import "./details-srt-import-v7-12-18.css";
import "./login-v7-14-0.css";
import "./player-pro-v7-20.css";
import "./auto-subtitles-v7-25-0.css";
import "./player-controls-v7-27-7.css";
import "./settings-v7-28-0.css";
import "./light-home-v7-29-0.css";
import "./player-design-v7-30-0.css";
import "./tooltip-v7-31-0.css";
import "./popups-v7-32-0.css";
import "./ui-kit-v7-33-0.css";
import "./ui-settings-v7-34-0.css";
import "./ui-player-v7-35-0.css";
import "./ui-loading-v7-36-0.css";
import "./player-controls-below-7-40-6.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin", "greek"],
  display: "swap",
});

const SITE_URL = "https://greektubesubs.com";
const BRAND_REV = "7820";
const DEFAULT_SHARE_IMAGE = `${SITE_URL}/api/share-card?v=${BRAND_REV}&title=${encodeURIComponent("YouTube με ελληνικούς υπότιτλους")}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "GreekTube Subs",
  title: "GreekTube Subs — YouTube με ελληνικούς υπότιτλους",
  description:
    "Παίξε δημόσια YouTube videos με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους και συγχρονισμένο transcript.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "GreekTube Subs",
    title: "GreekTube Subs — YouTube με ελληνικούς υπότιτλους",
    description:
      "Παίξε δημόσια YouTube videos με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους και συγχρονισμένο transcript.",
    images: [{ url: DEFAULT_SHARE_IMAGE, width: 1200, height: 630, alt: "GreekTube Subs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GreekTube Subs — YouTube με ελληνικούς υπότιτλους",
    description: "YouTube με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους.",
    images: [DEFAULT_SHARE_IMAGE],
  },
  other: {
    "codex-preview": `v${APP_VERSION}-gtslogo-final`,
    "app-version": APP_VERSION,
  },
  icons: {
    icon: [{ url: `/gtslogo.svg?v=${BRAND_REV}`, type: "image/svg+xml" }],
    shortcut: `/gtslogo.svg?v=${BRAND_REV}`,
    apple: [{ url: `/gtslogo.svg?v=${BRAND_REV}`, type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var d=document.documentElement,t=null,s=null;\ntry{t=localStorage.getItem(\"greektube-quick-theme:v1\")}catch(e){}\nif(t!==\"dark\"&&t!==\"light\"){try{s=JSON.parse(localStorage.getItem(\"greektube-personal-state:v1\")||\"null\");t=s&&s.settings&&s.settings.theme}catch(e){}}\nif(t===\"system\")t=matchMedia(\"(prefers-color-scheme: light)\").matches?\"light\":\"dark\";\nif(t!==\"dark\"&&t!==\"light\")t=\"dark\";\nd.dataset.theme=t;d.style.colorScheme=t;\nif(location.pathname===\"/\"){\nwindow.__gtState=fetch(\"/api/state\",{credentials:\"same-origin\",cache:\"no-store\"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});\nsetTimeout(function(){d.dataset.appReady=\"1\"},7000);\n}\n}catch(e){}})();" }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        {children}
        <UserProfileEnhancer />
        <TooltipLayer />
      </body>
    </html>
  );
}
