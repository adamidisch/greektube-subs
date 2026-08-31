import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { APP_VERSION } from "./version";
import UserProfileEnhancer from "./UserProfileEnhancer";
import "./globals.css";
import "./mobile-controls-fix.css";
import "./ui-651.css";
import "./ui-653.css";
import "./ui-654.css";
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
import "./v7-8-12-theme-toggle.css";
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
import "./release-lock-7-8-44.css";
import "./mobile-player-polish-7-8-44.css";
import "./release-lock-7-8-45.css";
import "./player-time-ui.css";
import "./audio-timing-capture.css";
import "./player-loading-polish.css";

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
    <html lang="el">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        {children}
        <UserProfileEnhancer />
      </body>
    </html>
  );
}
