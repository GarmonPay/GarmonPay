"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";

type Props = {
  supabase: SupabaseClient | null;
  value: string;
  onChange: (v: string) => void;
  excludeUserId?: string | null;
  disabled?: boolean;
  id?: string;
  label?: string;
  placeholder?: string;
  inputClassName?: string;
  labelClassName?: string;
};

export function UsernameAvailabilityField({
  supabase,
  value,
  onChange,
  excludeUserId = null,
  disabled = false,
  id = "username",
  label = "Username",
  placeholder = "your_username",
  inputClassName = "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#7c3aed]/60 focus:outline-none focus:ring-1 focus:ring-[#7c3aed]/30",
  labelClassName = "block text-xs font-medium text-fintech-muted mb-1",
}: Props) {
  const { state, message } = useUsernameAvailability(supabase, value, { excludeUserId });

  const feedbackColor =
    state === "available"
      ? "text-[#f5c842]"
      : state === "checking"
        ? "text-white/50"
        : state === "idle"
          ? "text-transparent"
          : "text-red-300";

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        className={inputClassName}
      />
      {state !== "idle" && (
        <p className={`mt-1 text-xs ${feedbackColor}`}>
          {state === "available" ? "✓ " : state === "checking" ? "… " : "✕ "}
          {message}
        </p>
      )}
    </div>
  );
}
