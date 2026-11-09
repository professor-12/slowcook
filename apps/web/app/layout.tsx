import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { WalletButton } from "@/components/WalletButton";

export const metadata: Metadata = {
  title: "SlowCook",
  description: "Memecoin launches on NEAR where being first is worthless: sealed bids, one clearing price, burn, and a rule-bound Floor Keeper.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <div className="wrap">
            <nav className="top">
              <Link href="/" className="brand">
                Slow<span>Cook</span>
              </Link>
              <Link href="/">Launches</Link>
              <Link href="/create/">Create</Link>
              <Link href="/why/">Why SlowCook</Link>
              <span className="badge warn">testnet · test NEAR only</span>
              <span className="spacer" />
              <WalletButton />
            </nav>
            {children}
            <footer>
              Built at NEAR HACKATHON. Testnet only: no real value is raised. Contracts and tests:{" "}
              <a href="https://github.com/REPLACE_ME/slowcook">github</a>.
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
