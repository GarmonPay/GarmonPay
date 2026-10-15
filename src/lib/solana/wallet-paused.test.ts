import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
const source = readFileSync("src/components/solana/WalletSignIn.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const exported: { WalletSignIn?: () => React.ReactElement } = {};
runInNewContext(compiled, { exports: exported, require: (name: string) => name === "react" ? { ...React, useEffect: () => undefined } : name === "react/jsx-runtime" ? jsxRuntime : { walletAuthEnabled } });
import { walletAuthEnabled } from "./policy";

describe("wallet activation boundary", () => {
  it("uses the reviewed code flag rather than a public environment toggle", () => {
    vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED", "false");
    try {
      expect(walletAuthEnabled()).toBe(true);
      expect(source).toContain("Wallet sign-in paused");
      expect(source).toContain("No wallet signature is requested");
      expect(source).toContain("Phantom");
      expect(source).toContain("Solflare");
      expect(source).toContain("Backpack");
      expect(source).not.toContain("seed phrase");
      expect(source).not.toContain("private key");
    } finally { vi.unstubAllEnvs(); }
  });
});
