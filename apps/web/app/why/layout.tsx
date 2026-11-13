import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/why/" },
  title: "Why SlowCook: bonding curve vs sealed bids (simulated)",
  description: "Simulated with the same 200 wallets: on a bonding curve insiders take 40% of supply; in SlowCook 11%, and dumping at launch stops paying.",
};

export default function WhyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
