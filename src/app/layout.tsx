import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://polymarket.dylanwheeler.net";

export const metadata: Metadata = {
  title: {
    default: "Polymarket Viewer",
    template: "%s · Polymarket Viewer",
  },
  description: "TV-friendly delayed probability & candlestick viewer for Polymarket markets.",
  applicationName: "Polymarket Viewer",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "Polymarket Viewer",
    description: "Large-format delayed probabilities & lightweight candlesticks for Polymarket.",
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Polymarket Viewer",
    description: "Large-format delayed probabilities & lightweight candlesticks for Polymarket.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
