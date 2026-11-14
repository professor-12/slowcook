// Turn contract and wallet errors into messages that say what happened and what to do
// (docs/design/niches/fintech/text-copy.md: money errors say what did and did not happen).
const CODES: Record<string, string> = {
  E_PHASE: "That step is not open in the current phase.",
  E_HASH: "The reveal does not match your sealed bid. Load the receipt saved by the wallet you bid with.",
  E_DEPOSIT: "The deposit does not cover price × quantity.",
  E_DUP: "This was already done for your account.",
  E_CAP: "This launch has reached its maximum number of bids.",
  E_NOT_FINAL: "Trading and claims open after the auction is finalized.",
  E_SLIPPAGE: "The price moved past your 1% limit.",
  E_TRIGGER: "The buyback is not armed: the price has not stayed below the floor long enough.",
  E_EPOCH_CAP: "The buyback already spent this epoch's budget. Try again in the next epoch.",
  E_LOCKED: "Creator tokens are not releasable yet: the lock is still running, the price has not held above clearing plus 5% for the required intervals, or nothing new has vested.",
  E_TOO_SOON: "A price observation was recorded moments ago. Wait for the interval to pass.",
  E_NO_BID: "Your account has no bid in this launch.",
  E_PARAMS: "One of the values is out of range.",
  E_AUTH: "Your account is not allowed to do this.",
};

export function explainError(e: unknown): string {
  const raw = String((e as Error)?.message ?? e);
  const code = raw.match(/E_[A-Z_]+/)?.[0];
  if (code && CODES[code]) return `Not done. ${CODES[code]} Any NEAR you attached was returned; only the network fee was charged.`;
  if (/reject|cancel|denied|closed/i.test(raw)) return "Not sent. You closed or rejected the wallet request, so nothing was charged.";
  // Any other wallet error is ambiguous: some wallets report one after the transaction was already sent.
  return `Your wallet reported an error: "${raw.slice(0, 120)}". It may still have sent the transaction. Check your wallet's activity or reload this page before trying again.`;
}
