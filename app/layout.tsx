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
import "./v7-8-14-brand-mark-svg.css";
import "./v7-8-15-modal-shell.css";
import "./v7-8-16-home-title-polish.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GreekTube Subs — YouTube με ελληνικούς υπότιτλους",
  description:
    "Παίξε δημόσια YouTube videos με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους και συγχρονισμένο transcript.",
  other: {
    "codex-preview": `v${APP_VERSION}-production-cleanup`,
    "app-version": APP_VERSION,
  },
  icons: {
    icon: "/favicon.svg?v=654dev",
    shortcut: "/favicon.svg?v=654dev",
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
