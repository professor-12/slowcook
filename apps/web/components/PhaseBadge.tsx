import { CircleCheck, CircleX, Clock, Lock, Unlock } from "lucide-react";

const PHASES: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
  Deploying: { label: "Deploying token", cls: "", Icon: Clock },
  Commit: { label: "Sealed bidding", cls: "badge-live", Icon: Lock },
  Reveal: { label: "Reveal", cls: "badge-warn", Icon: Unlock },
  AwaitingFinalize: { label: "Ready to finalize", cls: "badge-warn", Icon: Clock },
  Finalizing: { label: "Finalizing", cls: "", Icon: Clock },
  Trading: { label: "Trading", cls: "badge-live", Icon: CircleCheck },
  Failed: { label: "Failed, refunds open", cls: "badge-bad", Icon: CircleX },
};

export function PhaseBadge({ phase }: { phase: string }) {
  const p = PHASES[phase] ?? { label: phase, cls: "", Icon: Clock };
  return (
    <span className={`badge ${p.cls}`}>
      <p.Icon size={14} aria-hidden /> {p.label}
    </span>
  );
}
