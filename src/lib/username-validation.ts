export const RESERVED_USERNAMES = new Set([
  "admin",
  "garmonpay",
  "support",
  "mod",
  "moderator",
  "system",
  "official",
  "bishop",
  "anthropic",
  "claude",
  "root",
  "null",
]);

export type UsernameAvailabilityState = "idle" | "checking" | "available" | "invalid" | "reserved" | "taken";

export function validateUsernameFormat(value: string): {
  ok: boolean;
  reason?: string;
  state?: UsernameAvailabilityState;
} {
  if (value.length < 3 || value.length > 20) {
    return { ok: false, reason: "Must be 3-20 characters", state: "invalid" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    return { ok: false, reason: "Letters, numbers, and underscore only", state: "invalid" };
  }
  if (RESERVED_USERNAMES.has(value.toLowerCase())) {
    return { ok: false, reason: "Reserved", state: "reserved" };
  }
  return { ok: true };
}
