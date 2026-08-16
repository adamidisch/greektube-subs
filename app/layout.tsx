import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_VERSION } from "./version";
import UserProfileEnhancer from "./UserProfileEnhancer";
import "./globals.css";
import "./mobile-controls-fix.css";
import "./ui-651.css";
import "./ui-653.css";
import "./ui-654.css";
import "./mobile-controls-final.css";
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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <UserProfileEnhancer />
      </body>
    </html>
  );
}
