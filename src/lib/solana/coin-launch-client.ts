import { validateTokenMetadata } from "./token-metadata";

export function formatCoinAge(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return null;
  const delta = now - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return null;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatDevnetLaunchTime(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "long", timeZone: "UTC" }).format(date);
}

export function validateCoinDraft(input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!name || name.length > 32) throw new Error("Coin name must contain 1–32 characters.");
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new Error("Ticker must contain 1–10 letters or digits.");
  if (!description || description.length > 2000) throw new Error("Description must contain 1–2,000 characters.");
  try { return validateTokenMetadata({ ...input, name, symbol, description }); }
  catch { throw new Error("Remove angle brackets or control characters, and use public HTTPS website/social links."); }
}

export type CoinPhase = "suggestion" | "connection" | "preparation" | "review" | "signature" | "submission";
const messages: Record<CoinPhase, string> = {
  suggestion: "AI suggestions timed out. Try again or enter the details yourself.",
  connection: "Wallet connection timed out. Open your wallet, close any old request and try again.",
  preparation: "Devnet preparation timed out. Nothing was submitted. Try again shortly.",
  review: "Cost review expired. Nothing was signed. Press Launch to prepare a fresh Devnet transaction.",
  signature: "Wallet signing timed out. Nothing was submitted by GarmonPay. Close the old wallet request before retrying.",
  submission: "Devnet submission/confirmation timed out. A transaction may have been sent. Check your wallet on Devnet Explorer before retrying.",
};

/** Ignore late results, abort fetches and release busy state on every exit path. */
export function coinOperation<T>(operation: () => Promise<T>, phase: CoinPhase, signal?: AbortSignal, ms = phase === "submission" ? 75000 : 45000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Cancelled before submission.")); return; }
    const clean = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
    const cancel = () => { clean(); reject(new Error("Cancelled before submission. Nothing was sent by GarmonPay.")); };
    const timer = setTimeout(() => { clean(); reject(new Error(messages[phase])); }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => { if (signal?.aborted) throw new Error("Cancelled before submission."); return operation(); }).then(value => { clean(); resolve(value); }, error => { clean(); reject(error); });
  });
}

export async function coinJson(url: string, body: Record<string, unknown>, phase: CoinPhase, signal?: AbortSignal) {
  const label = phase === "suggestion" ? "AI suggestion" : phase === "submission" ? "Devnet submission/confirmation" : "Devnet preparation";
  const request = new AbortController();
  const stop = () => request.abort(); signal?.addEventListener("abort", stop, { once: true });
  try {
    return await coinOperation(async () => {
      let response: Response;
      try { response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.signal }); }
      catch { throw new Error(`${label} network request failed. ${phase === "submission" ? "A transaction may have been sent; check Devnet Explorer before retrying." : "Nothing was submitted. Check your connection and try again."}`); }
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`${label} returned an unreadable response. ${phase === "submission" ? "Check Devnet Explorer before retrying." : "Nothing was submitted. Try again."}`);
      if (!response.ok) {
        const failure = new Error(`${label} failed: ${payload.error || payload.message || `request rejected (${response.status}). Try again shortly.`}` + (payload.submitted === true && typeof payload.signature === "string" ? ` Devnet transaction ID: ${payload.signature}. Check Solana Explorer before retrying.` : ""));
        if (typeof payload.code === "string") Object.assign(failure, { code: payload.code });
        throw failure;
      }
      return payload;
    }, phase, signal);
  } finally { request.abort(); signal?.removeEventListener("abort", stop); }
}
