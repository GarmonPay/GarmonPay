"use client";

import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white border border-[#7c3aed]/40 shadow-[0_0_0_1px_rgba(124,58,237,0.15)]",
  danger: "rounded-xl bg-red-600/90 hover:bg-red-600 text-white border border-red-500/30",
  gold: "rounded-xl bg-[#f5c842] hover:bg-[#e6bb3d] text-[#0e0118] font-semibold border border-[#f5c842]/40",
} as const;

export type ActionButtonVariant = keyof typeof variants;

export function ActionButton({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[36px] min-w-[60px] items-center justify-center px-3 py-2 text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0 disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
