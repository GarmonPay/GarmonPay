import { validateTokenMetadata } from "./token-metadata";

const FIELDS = ["name", "symbol", "description", "keywords"] as const;
export type CoinField = (typeof FIELDS)[number];

/** A configured text-model key is enough. Suggestions run only when a person asks. */
export function coinSuggestionsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length >= 20;
}

/** Meshy is a 3D service and its paid calls are disabled. It is not a token-icon generator. */
export function coinArtworkEnabled() {
  return false as const;
}

export const ARTWORK_BLOCKER = "GarmonPay does not generate or pay for images. Paste the prompt into your own ChatGPT account, then upload the finished picture.";

export function requestedCoinFields(value: unknown): CoinField[] {
  if (!Array.isArray(value) || value.length === 0) return [...FIELDS];
  const fields = value.filter((field): field is CoinField => FIELDS.includes(field as CoinField));
  return fields.length ? [...new Set(fields)] : [...FIELDS];
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const arrayAt = raw.indexOf("[");
  const objectAt = raw.indexOf("{");
  const useArray = arrayAt >= 0 && (objectAt < 0 || arrayAt < objectAt);
  const start = useArray ? arrayAt : objectAt;
  const end = useArray ? raw.lastIndexOf("]") : raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Invalid suggestion");
  return JSON.parse(raw.slice(start, end + 1));
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
}

/** Accept only fields that pass the same metadata rules as a manual draft. */
export function parseCoinSuggestion(payload: unknown, fields: CoinField[] = [...FIELDS]) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid suggestion");
  const record = payload as Record<string, unknown>;
  const next: Partial<Record<CoinField, string>> = {};
  if (fields.some(field => field === "name" || field === "symbol" || field === "description")) {
    const metadata = validateTokenMetadata({
      name: fields.includes("name") ? clean(record.name) : "Draft Name",
      symbol: fields.includes("symbol") ? clean(record.symbol).toUpperCase() : "DRAFT",
      description: fields.includes("description") ? clean(record.description) : "Draft description.",
      website: "",
      social: "",
    });
    if (fields.includes("name")) next.name = metadata.name;
    if (fields.includes("symbol")) next.symbol = metadata.symbol;
    if (fields.includes("description")) next.description = metadata.description;
  }
  if (fields.includes("keywords")) next.keywords = clean(record.keywords).slice(0, 120);
  if (!Object.keys(next).length) throw new Error("Invalid suggestion");
  return { ...next, artworkAvailable: false as const };
}

/** Keep distinct usable drafts. Invalid model rows are dropped instead of shown as finished coins. */
export function parseCoinSuggestions(payload: unknown, fields: CoinField[] = [...FIELDS], limit = 3) {
  const rows = Array.isArray(payload) ? payload : [payload];
  const suggestions = [];
  const seen = new Set<string>();
  for (const row of rows) {
    let suggestion: ReturnType<typeof parseCoinSuggestion>;
    try { suggestion = parseCoinSuggestion(row, fields); } catch { continue; }
    const key = [suggestion.name, suggestion.symbol, suggestion.description, suggestion.keywords].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length >= limit) break;
  }
  if (!suggestions.length) throw new Error("Invalid suggestion");
  return suggestions;
}
