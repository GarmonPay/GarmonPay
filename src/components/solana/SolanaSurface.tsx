import type { ReactNode } from "react";
export function FeatureStatus({ children = "Activation pending" }: { children?: ReactNode }) {
  return <span className="gp-sol-tag gp-sol-status"><span aria-hidden="true" />{children}</span>;
}
export function SolanaSurface({ title, description, children, className = "" }: {
  title: string; description?: string; children?: ReactNode; className?: string;
}) {
  return <section className={`gp-sol-panel ${className}`}>
    <h2>{title}</h2>{description && <p className="gp-sol-muted">{description}</p>}{children}
  </section>;
}
