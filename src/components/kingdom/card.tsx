import type { ReactNode } from "react";

type KingdomCardProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
};

export function KingdomCard({ eyebrow, title, children }: KingdomCardProps) {
  return (
    <article className="gp-kingdom-card">
      {eyebrow ? <p className="gp-kingdom-kicker">{eyebrow}</p> : null}
      <h3>{title}</h3>
      {children}
    </article>
  );
}
