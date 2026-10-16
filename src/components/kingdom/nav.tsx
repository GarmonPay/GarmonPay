"use client";

import { useId, useState } from "react";

type Item = { id: string; label: string; current?: boolean };

type KingdomNavProps = {
  label: string;
  items: readonly Item[];
};

export function KingdomNav({ label, items }: KingdomNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <nav className="gp-kingdom-nav" aria-label={label}>
      <button className="gp-kingdom-menu" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {open ? "Close menu" : "Menu"}
      </button>
      <ul id={panelId} className={open ? "is-open" : undefined}>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" aria-current={item.current ? "page" : undefined}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
