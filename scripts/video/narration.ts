// Demo video narration. `say` is what the voice reads (spelled for text-to-speech); `cap` is the
// on-screen caption. Every figure is sourced:
//  - pump.fun same-block sniping (>50%, 2025): Pine Analytics 2025-04-21 (research/00-brief.md)
//  - bundled wallets 36.5% of supply on Solana launchpads: MELT dataset, arXiv 2602.13480 (research/00-brief.md)
//  - simulation (40.3%, +437%, 10.7%, -9.2%): results/sim-summary-SIMULATED.json
//  - launch 1: results/launch-1-2026-11-12T07-16-28-408Z.json; dump: results/dump-1-2026-11-12T07-21-36-824Z.json
//  - tests: verification/test-report.md (54 + 4 contract tests, 1000-case property tests, CI)

export type Visual =
  | { kind: "card"; id: "title" | "end" }
  | { kind: "terminal"; id: "launch" | "dump" }
  | { kind: "page"; path: string; action: "hero" | "steps" | "why" | "launch-curve" | "launch-keeper" };

export interface Line {
  say: string;
  cap: string;
}
export interface Scene {
  id: string;
  visual: Visual;
  lines: Line[];
  minSecs?: number;
}

const same = (s: string): Line => ({ say: s, cap: s });

export const SCENES: Scene[] = [
  { id: "title", visual: { kind: "card", id: "title" }, lines: [], minSecs: 2.2 },
  {
    id: "problem",
    visual: { kind: "page", path: "/", action: "hero" },
    lines: [
      {
        say: "In 2025, more than half of new pump dot fun tokens were sniped in the same block they were created.",
        cap: "In 2025, more than half of new pump.fun tokens were sniped in the same block they were created.",
      },
      same("Across Solana launchpads, bundled wallets hold over a third of supply on average."),
      { say: "Being first is the whole game. Slow Cook makes being first worthless.", cap: "Being first is the whole game. SlowCook makes being first worthless." },
    ],
  },
  {
    id: "how",
    visual: { kind: "page", path: "/", action: "steps" },
    lines: [
      same("Bids are sealed. When bidding closes, everyone reveals, and the contract sets one clearing price that every winner pays."),
      same("Unsold supply is burned, and trading opens at exactly that price."),
    ],
  },
  {
    id: "sim",
    visual: { kind: "page", path: "/why/", action: "why" },
    lines: [
      same("In a simulation, we ran the same two hundred wallets through both designs, a thousand times."),
      {
        say: "On a bonding curve, bots and a bundler take forty percent of supply, and make over four hundred percent by dumping.",
        cap: "On a bonding curve, bots and a bundler take 40% of supply, and make over 400% by dumping.",
      },
      {
        say: "In Slow Cook they take eleven percent, and lose about nine percent, even when they can see all retail demand.",
        cap: "In SlowCook they take 11%, and lose about 9%, even when they can see all retail demand.",
      },
    ],
  },
  {
    id: "launch",
    visual: { kind: "terminal", id: "launch" },
    lines: [
      same("This is a real launch on NEAR testnet."),
      same("Twelve wallets committed sealed bids. Nobody could see a price, not bots and not the creator."),
      same("A reveal with the wrong secret was rejected."),
    ],
  },
  {
    id: "clear",
    visual: { kind: "page", path: "/launch/?id=1", action: "launch-curve" },
    lines: [
      same("Anyone can finalize. The contract fills bids from the highest price down."),
      {
        say: "All six hundred thousand tokens sold at one clearing price, and the wallet that bid seven times higher paid exactly the same price per token.",
        cap: "All 600,000 tokens sold at one clearing price, and the wallet that bid 7× higher paid exactly the same price per token.",
      },
      same("The pool opened at exactly that price, and the result matched our model's prediction made before launch."),
    ],
  },
  {
    id: "dump",
    visual: { kind: "terminal", id: "dump" },
    lines: [
      same("Then we scripted a sell-off. Six holders dumped, and the price fell to about a quarter of the clearing price."),
      {
        say: "After three time-weighted intervals below the floor, the Floor Keeper bought back and burned tokens, using exactly its ten percent cap.",
        cap: "After three time-weighted intervals below the floor, the Floor Keeper bought back and burned tokens, using exactly its 10% cap.",
      },
      same("A second buyback in the same epoch was refused."),
    ],
  },
  {
    id: "keeper",
    visual: { kind: "page", path: "/launch/?id=1", action: "launch-keeper" },
    lines: [
      {
        say: "The live page shows a hundred and three thousand tokens bought back and burned.",
        cap: "The live page shows 103,215 tokens bought back and burned.",
      },
      same("The creator's tokens stayed locked until the price recovered and held."),
    ],
  },
  {
    id: "end",
    visual: { kind: "card", id: "end" },
    lines: [
      same("Every rule is a contract method with a test, and CI runs on every push."),
      { say: "Live demo and code are linked below. Built at NEAR HACKATHON.", cap: "Live demo and code are linked below. Built at NEAR HACKATHON." },
    ],
    minSecs: 8,
  },
];
