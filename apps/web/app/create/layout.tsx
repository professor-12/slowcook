import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/create/" },
  title: "Create a launch | SlowCook on NEAR testnet",
  description: "Set supply, a minimum price and bidding windows for a sealed-bid memecoin launch on NEAR testnet. The creator share is capped at 10% and locked.",
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
