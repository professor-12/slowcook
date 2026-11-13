import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const display = localFont({ src: "./fonts/instrument-sans.woff2", weight: "500 700", variable: "--font-instrument", display: "swap" });
const sans = localFont({ src: "./fonts/ibm-plex-sans.woff2", weight: "400 600", variable: "--font-plex", display: "swap" });
const mono = localFont({ src: "./fonts/ibm-plex-mono.woff2", weight: "400", variable: "--font-plex-mono", display: "swap", preload: false });

import { SITE_URL } from "@/content/site";

export const metadata: Metadata = {
  title: "SlowCook: sealed-bid memecoin launches on NEAR",
  description:
    "Memecoin launches on NEAR testnet where every winner pays one clearing price, unsold supply is burned and a capped treasury defends the price.",
  ...(SITE_URL
    ? {
        metadataBase: new URL(SITE_URL),
        openGraph: {
          title: "SlowCook: memecoin launches where being first is worthless",
          description: "Sealed bids, one clearing price for every winner, unsold supply burned, and a capped treasury that defends the price. NEAR testnet.",
          images: [{ url: "/og.png", width: 1200, height: 630, alt: "SlowCook: memecoin launches where being first is worthless" }],
        },
        twitter: { card: "summary_large_image", images: ["/og.png"] },
      }
    : {}),
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal{opacity:1;transform:none}`}</style>
        </noscript>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <WalletProvider>
          <SiteHeader />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}
