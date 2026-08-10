import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./mobile-controls-fix.css";
import "./ui-651.css";
import "./ui-653.css";
import "./ui-654.css";
import "./mobile-controls-final.css";
import "./desktop-controls-final.css";
import "./content-areas-final.css";
import "./release-6.6.15.css";

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
    "codex-preview": "final-v7.1.7",
    "app-version": "7.1.7",
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
      </body>
    </html>
  );
}
