"use client";

import { useId, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";

type KingdomFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function KingdomField({ label, hint, error, id, ...props }: KingdomFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="gp-kingdom-field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {hint ? <p className="gp-kingdom-hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="gp-kingdom-error" id={errorId}>{error}</p> : null}
    </div>
  );
}

export function KingdomForm({ label, children }: { label: string; children: ReactNode }) {
  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }
  return <form aria-label={label} onSubmit={hold}>{children}</form>;
}
