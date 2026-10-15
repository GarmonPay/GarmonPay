"use client";

import { useEffect, useState } from "react";

type Token = { mint: string; name: string; symbol: string; lifecycle: string };
const lifecycles = new Set(["curve", "graduating", "graduated"]);
const lifecycleLabels: Record<string, string> = {
  curve: "Bonding curve",
  graduating: "Graduation in progress",
  graduated: "Graduated launch",
};

/** Validate the discovery contract; this is not independent on-chain verification. */
export function parseDiscoveryTokens(payload: unknown): Token[] {
  if (!payload || typeof payload !== "object" || !("tokens" in payload)) {
    throw new Error("Invalid discovery response");
  }
  const records = payload.tokens;
  if (!Array.isArray(records) || records.length > 50) {
    throw new Error("Invalid discovery response");
  }
  const seen = new Set<string>();
  return records.map((record: unknown) => {
    if (!record || typeof record !== "object") throw new Error("Invalid launch record");
    const token = record as Record<string, unknown>;
    if (
      typeof token.mint !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.mint) ||
      typeof token.name !== "string" || !token.name.trim() || token.name.length > 64 ||
      typeof token.symbol !== "string" || !token.symbol.trim() || token.symbol.length > 16 ||
      typeof token.lifecycle !== "string" || !lifecycles.has(token.lifecycle) ||
      seen.has(token.mint)
    ) throw new Error("Invalid launch record");
    seen.add(token.mint);
    return { mint: token.mint, name: token.name, symbol: token.symbol, lifecycle: token.lifecycle };
  });
}

export function filterDiscoveryTokens(tokens: Token[], query: string): Token[] {
  const term = query.trim().toLocaleLowerCase("en-US");
  return tokens.filter(token => [token.name, token.symbol, token.mint]
    .some(value => value.toLocaleLowerCase("en-US").includes(term)));
}

export function Spotlight(_options: { initialCategory?: string } = {}) {
  const [state, setState] = useState<"loading" | "ready" | "error" | "paused">("loading");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let current = true;
    setState("loading");
    setTokens([]);
    async function load() {
      try {
        const response = await fetch("/api/solana/discovery", {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Discovery unavailable");
        const payload = await response.json();
        const records = parseDiscoveryTokens(payload);
        if (current) {
          setTokens(records);
          setState(payload.recordsStatus === "paused" ? "paused" : "ready");
        }
      } catch {
        if (current) setState("error");
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const isLaunches = true;
  const visible = isLaunches ? filterDiscoveryTokens(tokens, query) : [];

  return (
    <section className="gp-sol-spotlight" aria-labelledby="spotlight-heading">
      <div className="gp-sol-section-top">
        <div>
          <p className="gp-sol-eyebrow">GARMONPAY</p>
          <h2 id="spotlight-heading">Our launches</h2>
        </div>
      </div>
      <div className="gp-sol-panel" aria-busy={state === "loading"}>
        {isLaunches && state !== "paused" && (
          <div className="mb-4">
            <label htmlFor="spotlight-search" className="gp-sol-muted">Search</label>
            <input id="spotlight-search" type="search" value={query} maxLength={100}
              onChange={event => setQuery(event.target.value)}
              placeholder="Token name, symbol or mint address"
              className="mt-2 block w-full rounded-lg border border-white/20 bg-black/20 px-3 py-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              aria-describedby="spotlight-search-help" />
            <p id="spotlight-search-help" className="sr-only">Search GarmonPay launches</p>
          </div>
        )}
        {state === "paused" ? <p role="status">GarmonPay launches will appear here.</p> : state === "loading" ? (
          <p role="status">Loading verified launch records…</p>
        ) : state === "error" ? (
          <div role="status">
            <h3>Discovery is temporarily unavailable</h3>
            <p className="gp-sol-muted">We cannot verify launch records right now.</p>
            <button className="gp-button" type="button" onClick={() => setAttempt(value => value + 1)}>
              Try again
            </button>
          </div>
        ) : visible.length > 0 ? (
          <>
            <p className="gp-sol-muted" role="status">{visible.length} matching launch {visible.length === 1 ? "record" : "records"}</p>
            <div className="gp-sol-grid">
              {visible.map(token => (
                <article className="gp-market-card" key={token.mint}>
                  <p className="gp-market-symbol">{token.symbol}</p>
                  <h3>{token.name}</h3>
                  <p className="gp-fee-note">{lifecycleLabels[token.lifecycle]}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div role="status">
            <h3>{tokens.length > 0 && query.trim() ? "No matching launches" : "No GarmonPay launches yet"}</h3>
          </div>
        )}
      </div>
    </section>
  );
}
