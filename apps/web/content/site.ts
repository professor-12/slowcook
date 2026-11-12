// All user-facing copy (docs/design/core/text-copy.md + fintech overrides).
// Every number here is real and has a source; simulated figures are labelled SIMULATED.
// Sources: results/launch-1-2026-11-12T07-16-28-408Z.json, results/dump-1-2026-11-12T07-21-36-824Z.json,
// verification/test-report.md, sim/README.md.

export const REPO_URL = "https://github.com/REPLACE_ME/slowcook";
export const EXPLORER = "https://testnet.nearblocks.io";
export const FACTORY_ID = "slowcook-0dd752.testnet";
export const CODE_HASH = "9A6qZZvajAXpEfa7UCrzNuZ1HF1ushD8wb7TdCSiSsEy";

export interface Link {
  label: string;
  href: string;
}

export const nav: Link[] = [
  { label: "Launches", href: "/#launches" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Create", href: "/create/" },
  { label: "Why SlowCook", href: "/why/" },
];

export const home = {
  hero: {
    eyebrow: "NEAR testnet launchpad",
    title: "Memecoin launches where being first is worthless.",
    subtitle:
      "Bids stay sealed until bidding closes. Every winner pays one clearing price, unsold supply is burned, and trading opens at that price.",
    primary: { label: "See a launch", href: "/launch/?id=1" },
    secondary: { label: "Create a launch", href: "/create/" },
    proof: "Unaudited contracts on NEAR testnet. Test NEAR only.",
  },
  proof: {
    eyebrow: "Launch 1 on testnet, 12 Nov 2026",
    title: "What happened on-chain",
    items: [
      { value: "1 price", label: "paid by all 11 winning bids, including one placed 7× higher" },
      { value: "600,000", label: "tokens sold out of 600,000 for sale, 0 burned" },
      { value: "5.86 NEAR", label: "seeded the pool at exactly the clearing price" },
      { value: "0 yocto", label: "difference between our model's prediction and the chain" },
    ],
    source: { label: "Check every transaction", href: `${EXPLORER}/address/${FACTORY_ID}` },
  },
  steps: {
    eyebrow: "How it works",
    title: "Six steps. No race to be first.",
    items: [
      { title: "Create", body: "The creator sets supply, a minimum price and the bidding window. The token starts with zero supply." },
      { title: "Seal", body: "You send a hash of your price and quantity with a deposit. Nobody can read the price, the creator included." },
      { title: "Reveal", body: "After bidding closes you reveal. The contract rejects any reveal that does not match its hash." },
      { title: "Clear", body: "The contract fills bids from the highest price down. The price where supply runs out is the price everyone pays." },
      { title: "Trade", body: "Winners claim tokens and refunds. A pool opens at exactly the clearing price, with its liquidity locked." },
      { title: "Defend", body: "If the time-weighted price stays below the floor, anyone can trigger a capped buyback that burns what it buys." },
    ],
  },
  values: {
    eyebrow: "The rules",
    title: "Rules the contract enforces after launch too",
    items: [
      {
        title: "Speed buys nothing.",
        claims: [
          "Every winner pays the clearing price. A high bid only makes sure you are filled.",
          "Twenty wallets get the same price as one.",
          "On testnet a bid 7× above clearing paid 0.1837 NEAR for 9,409 tokens, the same price per token as the lowest winner.",
        ],
      },
      {
        title: "Supply follows real demand.",
        claims: [
          "Tokens nobody bought are never minted.",
          "Pool and creator shares scale with what sold, so a weak sale cannot leave the pool underfunded.",
        ],
      },
      {
        title: "A treasury with one job.",
        claims: [
          "It acts only after the time-weighted price stays below clearing minus 10% for several intervals. A one-block dip does nothing.",
          "It spends at most 10% of its balance per epoch, never buys above the clearing price, and burns what it buys.",
          "On testnet it spent 0.5929 NEAR, burned 103,215 tokens, and refused a second buyback in the same epoch.",
        ],
      },
      {
        title: "The creator waits for the price.",
        claims: [
          "Creator tokens stay locked until the price holds at or above clearing for a set number of intervals in a row.",
          "On testnet the release was refused right after launch and allowed after the price held for 6 intervals.",
        ],
      },
    ],
  },
  launches: {
    eyebrow: "Live data",
    title: "Launches on testnet",
    intro: "Read directly from the contract. Prices stay sealed until each launch is finalized.",
  },
  trust: {
    eyebrow: "What you can check",
    title: "Verify it yourself",
    items: [
      {
        title: "Contract",
        body: `${FACTORY_ID} on NEAR testnet. Its code hash matches a build of the public repository.`,
        link: { label: "Open in explorer", href: `${EXPLORER}/address/${FACTORY_ID}` },
      },
      {
        title: "Tests",
        body: "51 unit tests, 1,000 random auctions per property-test run, 1,000 auctions matched against an independent model, and 4 runs on a local NEAR node.",
        link: { label: "Read the test report", href: `${REPO_URL}/blob/main/verification/test-report.md` },
      },
      {
        title: "Limits",
        body: "Deposits are public. One person can still use many wallets. The treasury slows a sell-off and cannot stop one. The contracts are unaudited.",
        link: { label: "Read the threat model", href: `${REPO_URL}/blob/main/docs/THREAT_MODEL.md` },
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Questions before you bid",
    items: [
      {
        q: "Can anyone see my bid before the reveal?",
        a: "No. Only a SHA-256 hash of your price, quantity and a random secret is stored. Your deposit is public, so it shows the most you could spend. Deposit more than you need to hide the real amount; the extra is refunded.",
      },
      {
        q: "If I bid a high price, do I pay it?",
        a: "No. Every winning bid pays the clearing price, the price at which supply runs out. A high bid only makes sure you are filled. Anything above the clearing cost comes back as a refund when you claim.",
      },
      {
        q: "What happens if I forget to reveal?",
        a: "Your bid is not counted. You get your deposit back minus a 5% penalty, which goes to the price-defence treasury. Keep the bid receipt the app downloads when you commit, because it holds the secret you need.",
      },
      {
        q: "What if not enough people bid?",
        a: "Everyone who bid is filled at the minimum price, and the unsold tokens are never created. If nobody bids at all, the launch fails and every deposit is refunded in full.",
      },
      {
        q: "Can the treasury stop a crash?",
        a: "It slows one. It buys back at most 10% of its balance per epoch, only after the price has stayed below the floor for several intervals, and never above the clearing price.",
      },
      {
        q: "Is this real money?",
        a: "No. SlowCook runs on NEAR testnet with test NEAR. The contracts are unaudited and no real tokens are offered or sold.",
      },
    ],
  },
  final: {
    title: "See one price set on-chain.",
    body: "Open launch 1 and check every bid, the clearing price and the buyback against the explorer.",
    primary: { label: "See launch 1", href: "/launch/?id=1" },
    secondary: { label: "Read the code", href: REPO_URL },
    status: "NEAR testnet. Test NEAR only. Contracts unaudited.",
  },
};

export const footer = {
  line: "Sealed-bid memecoin launches on NEAR. Built at NEAR HACKATHON 2026.",
  groups: [
    {
      title: "Product",
      links: [
        { label: "Launches", href: "/#launches" },
        { label: "Create a launch", href: "/create/" },
        { label: "Why SlowCook", href: "/why/" },
      ],
    },
    {
      title: "Evidence",
      links: [
        { label: "Contract on nearblocks", href: `${EXPLORER}/address/${FACTORY_ID}` },
        { label: "Source code", href: REPO_URL },
        { label: "Test report", href: `${REPO_URL}/blob/main/verification/test-report.md` },
      ],
    },
  ],
  legal: "Testnet demo. Not an offer of tokens. Contracts unaudited. MIT licence.",
};

export const why = {
  eyebrow: "SIMULATED",
  title: "Why SlowCook",
  lead: "On a bonding curve every buy raises the price, so the first buyer pays the least. In a sealed uniform-price auction every winner pays the same price.",
  chartTitle: "Same 200 wallets through both mechanisms",
  chartNote:
    "SIMULATED: synthetic agents, 1,000 runs. Bars show the median, whiskers the 5th to 95th percentile. In SlowCook the insiders get the strongest strategy we built: they know all retail demand and bid one tick above the price retail alone would set.",
  fixes: {
    title: "What it fixes",
    body: "Being first, splitting into 20 wallets, or bidding higher buys no better price. Unsold supply is burned instead of flooding the pool. The creator's tokens are released only after the price holds.",
  },
  limits: {
    title: "What it does not fix",
    body: "Deposits are public: they cap a bid without revealing it. One person can still use many wallets. The treasury slows a sell-off and cannot stop one. Not revealing is an option priced by a 5% penalty.",
  },
  method: { label: "Read the method", href: `${REPO_URL}/blob/main/sim/README.md` },
};

export const create = {
  title: "Create a launch",
  lead: "Set the supply, minimum price and bidding windows. Nothing trades until the auction clears. Your share is capped at 10% and stays locked until the price holds.",
  cost: "You attach about 2.1 NEAR on testnet: 1.59 NEAR stores the token code, 0.3 NEAR funds token storage, and 0.1 NEAR stores the launch. Anything extra funds token storage.",
  submit: "Create launch",
  connect: "Connect wallet to create",
};

export const launchCopy = {
  phases: ["Sealed bidding", "Reveal", "Finalize", "Trading"],
  takePart: "Take part",
  connectFor: {
    Commit: "Connect a NEAR testnet wallet to place a sealed bid.",
    Reveal: "Connect the wallet you bid with to reveal your bid.",
    AwaitingFinalize: "Connect a wallet to finalize the auction. Anyone can.",
    Trading: "Connect a wallet to claim, trade, record a price observation or trigger the buyback.",
    other: "Connect a NEAR testnet wallet to take part.",
  } as Record<string, string>,
};
