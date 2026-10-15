/** Shown instead of the browser's generic pattern message. */
export const DISPLAY_NAME_MESSAGE = "Use 2–32 letters or numbers. Spaces, apostrophes, periods, and hyphens are allowed.";
export const HANDLE_MESSAGE = "Public handles use 3–24 lowercase letters, numbers, or underscores.";

const RESERVED = ["admin", "administrator", "support", "garmonpay", "moderator"];

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new Error(DISPLAY_NAME_MESSAGE);
  const name = value.trim().replace(/\s+/g, " ");
  if (name === "") return "";
  if (name.length < 2 || name.length > 32 || !/^[A-Za-z0-9](?:[A-Za-z0-9 .'-]*[A-Za-z0-9])$/.test(name)) throw new Error(DISPLAY_NAME_MESSAGE);
  return name;
}

export function normalizeHandle(value: unknown): string {
  if (typeof value !== "string") throw new Error(HANDLE_MESSAGE);
  const handle = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle) || RESERVED.includes(handle)) throw new Error(HANDLE_MESSAGE);
  return handle;
}

export function generatedHandle(username: string): boolean {
  return /^m_[0-9a-f]{20}$/.test(username);
}

/** Public header label. A generated m_ username is not a display name. */
export function memberPublicLabel(member: { displayName?: unknown; username?: unknown } | null | undefined): string {
  const display = typeof member?.displayName === "string" ? member.displayName.trim().replace(/\s+/g, " ") : "";
  if (display) return display;
  const username = typeof member?.username === "string" ? member.username.trim() : "";
  if (username && !generatedHandle(username)) return username;
  return "Member";
}
