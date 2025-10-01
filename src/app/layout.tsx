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

export const metadata: Metadata = {
  title: {
    default: "Polymarket Viewer",
    template: "%s · Polymarket Viewer",
  },
  description: "TV-friendly delayed probability & candlestick viewer for Polymarket markets.",
  applicationName: "Polymarket Viewer",
  metadataBase:
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : undefined,
  openGraph: {
    title: "Polymarket Viewer",
    description: "Large-format delayed probabilities & lightweight candlesticks for Polymarket.",
    type: "website",
    url: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Polymarket Viewer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Polymarket Viewer",
    description: "Large-format delayed probabilities & lightweight candlesticks for Polymarket.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
