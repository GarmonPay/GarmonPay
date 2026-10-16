"use client";

import { useEffect, type ReactNode } from "react";

type KingdomShellProps = {
  nav: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

export function KingdomShell({ nav, action, children }: KingdomShellProps) {
  useEffect(() => {
    const stage = document.querySelector(".gp-kingdom-stage");
    if (!(stage instanceof HTMLElement)) return;
    const touched: HTMLElement[] = [];
    const apply = () => {
      for (const sibling of Array.from(document.body.children)) {
        if (sibling !== stage && sibling instanceof HTMLElement && !sibling.inert && !stage.contains(sibling)) {
          sibling.inert = true;
          touched.push(sibling);
        }
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      for (const element of touched) element.inert = false;
    };
  }, []);
  return (
    <div className="gp-kingdom">
      <a className="gp-kingdom-skip" href="#kingdom-preview-main">Skip to preview content</a>
      <header className="gp-kingdom-header">
        <p className="gp-kingdom-brand">Garmon<span>Pay</span></p>
        {nav}
        {action}
      </header>
      <main className="gp-kingdom-main" id="kingdom-preview-main">
        {children}
      </main>
      <footer className="gp-kingdom-footer">
        <p>Local design preview. Sample labels only. This page does not connect a wallet, show member records, or change financial settings.</p>
      </footer>
    </div>
  );
}
