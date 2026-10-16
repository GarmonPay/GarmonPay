import type { ReactNode } from "react";

type Tone = "working" | "paused" | "incomplete" | "planned" | "success" | "warning" | "danger" | "info";

type KingdomStatusProps = {
  tone: Tone;
  children: ReactNode;
};

export function KingdomStatus({ tone, children }: KingdomStatusProps) {
  return <span className={`gp-kingdom-status gp-kingdom-status-${tone}`}>{children}</span>;
}
