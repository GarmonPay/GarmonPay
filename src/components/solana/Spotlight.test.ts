import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Match Next's JSX compilation without changing the shared Vitest configuration.
const source = readFileSync(new URL("./Spotlight.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const componentModule: { exports: Record<string, (...args: any[]) => any> } = { exports: {} };
runInNewContext(compiled, {
  exports: componentModule.exports, module: componentModule, require: createRequire(import.meta.url), setTimeout, clearTimeout,
});
const { filterDiscoveryTokens, parseDiscoveryTokens } = componentModule.exports;

const token = { mint: "11111111111111111111111111111111", name: "Garmon Sample", symbol: "GPAY", lifecycle: "curve" };

describe("Spotlight discovery contract", () => {
  it("accepts an honest empty response and verified-record shape", () => {
    expect(parseDiscoveryTokens({ tokens: [], rankingStatus: "awaiting_verified_indexer" })).toEqual([]);
    expect(parseDiscoveryTokens({ tokens: [token] })).toEqual([token]);
  });
  it.each([null, {}, { tokens: null }, { tokens: "untrusted" }, { tokens: [null] },
    { tokens: [{ ...token, mint: "not-a-mint" }] }, { tokens: [{ ...token, lifecycle: "fake" }] },
    { tokens: [{ ...token, name: "" }] }, { tokens: [{ ...token, symbol: 42 }] },
    { tokens: [token, token] }, { tokens: Array(51).fill(token) }])("rejects malformed discovery data %j", payload => {
    expect(() => parseDiscoveryTokens(payload)).toThrow();
  });
  it.each([" garmon ", "gpay", "11111111111111111111111111111111"])("finds records by name, symbol or mint: %s", query => {
    expect(filterDiscoveryTokens([token], query)).toEqual([token]);
  });
  it("does not invent records for an unmatched query", () => {
    expect(filterDiscoveryTokens([token], "another token")).toEqual([]);
    expect(filterDiscoveryTokens([token], "  ")).toEqual([token]);
    expect(filterDiscoveryTokens([], "GPAY")).toEqual([]);
  });
});

describe("Spotlight request cleanup", () => {
  it.each(["resolved", "rejected"])("aborts and ignores a %s request after unmount", async outcome => {
    let effect: (() => () => void) | undefined;
    const updates: unknown[] = [];
    let signal: AbortSignal | undefined;
    let resolveRequest!: (value: unknown) => void;
    let rejectRequest!: (reason: unknown) => void;
    const pending = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const fixture: { exports: Record<string, (...args: any[]) => any> } = { exports: {} };
    const requireModule = createRequire(import.meta.url);
    runInNewContext(compiled, {
      exports: fixture.exports, module: fixture, AbortController, setTimeout, clearTimeout,
      require: (name: string) => name === "react" ? {
        useState: (initial: unknown) => [initial, (value: unknown) => updates.push(value)],
        useEffect: (callback: () => () => void) => { effect = callback; },
      } : requireModule(name),
      fetch: (_url: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return pending;
      },
    });
    fixture.exports.Spotlight();
    const cleanup = effect!();
    expect(signal?.aborted).toBe(false);
    cleanup();
    expect(signal?.aborted).toBe(true);
    updates.length = 0;
    if (outcome === "resolved") resolveRequest({ ok: true, json: async () => ({ tokens: [token] }) });
    else rejectRequest(new Error("Delayed network failure"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updates).toEqual([]);
  });
});
