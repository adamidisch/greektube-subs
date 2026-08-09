import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./mobile-controls-fix.css";
import "./ui-651.css";
import "./ui-653.css";
import "./ui-654.css";

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
    "codex-preview": "development",
    "app-version": "6.5.4",
  },
  icons: {
    icon: "/favicon.svg?v=654",
    shortcut: "/favicon.svg?v=654",
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
