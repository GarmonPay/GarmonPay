/** Normalize user-entered lobby / join codes: trim, uppercase, strip non-alphanumeric. */
export function normalizeCeloRoomLookupCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
