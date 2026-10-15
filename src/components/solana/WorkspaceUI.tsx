"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BarChart3, LockKeyhole, X } from "lucide-react";

export function WorkspaceEmpty({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="gp-workspace-empty"><span className="gp-sol-icon-tile"><BarChart3 size={23} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function AccountMetric({ label, note }: { label: string; note: string }) {
  return <article className="gp-account-metric"><p>{label}</p><strong aria-label={`${label} unavailable`}>—</strong><small>{note}</small></article>;
}

export function PausedAction({ children, reason }: { children: ReactNode; reason: string }) {
  const id = useId();
  return <div className="gp-paused-action"><button type="button" disabled className="gp-button gp-button-gold" aria-describedby={id}><LockKeyhole size={16} aria-hidden="true" />{children}</button><p id={id}>{reason}</p></div>;
}

export function WorkspaceTabs({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <div className="gp-workspace-tabs" role="group" aria-label={label}>{options.map(option => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`gp-workspace-notice ${error ? "gp-workspace-error" : ""}`} role={error ? "alert" : "status"}>{children}</p>;
}

/** Native modal handles focus trapping and Escape; restore focus to its trigger. */
export function ReviewDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { element.close(); trigger?.focus(); };
  }, [open]);
  return <dialog ref={dialog} className="gp-review-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="gp-review-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="gp-icon-button" aria-label="Close review" onClick={onClose}><X size={20} aria-hidden="true" /></button></div>{children}
    <button type="button" className="gp-button" onClick={onClose}>Back to editing</button>
  </dialog>;
}

export function LoadingRows({ label }: { label: string }) {
  return <div className="gp-loading-rows" role="status"><p>{label}</p>{[1, 2, 3].map(row => <span key={row} aria-hidden="true" />)}</div>;
}
