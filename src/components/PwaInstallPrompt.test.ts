import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("./PwaInstallPrompt.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(stored = false) {
  const values: unknown[] = [], listeners = new Map<string, (event: unknown) => void>();
  let cursor = 0, effect: (() => unknown) | undefined;
  const component: { exports: Record<string, () => any> } = { exports: {} };
  const requireModule = createRequire(import.meta.url);
  runInNewContext(compiled, { exports: component.exports, module: component,
    require: (name: string) => name === "react" ? {
      useState: (initial: unknown) => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value: unknown) => { values[index] = value; }]; },
      useEffect: (callback: () => unknown) => { effect = callback; },
    } : requireModule(name),
    window: { matchMedia: () => ({ matches: false }), navigator: {}, addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
    document: { referrer: "" }, sessionStorage: { getItem: () => stored ? "1" : null, setItem: () => { stored = true; } },
  });
  const render = () => { cursor = 0; return component.exports.PwaInstallPrompt(); };
  render(); effect!();
  return { render, values, emit: (event: unknown) => listeners.get("beforeinstallprompt")!(event) };
}

function button(tree: any, label: string): any {
  if (!tree || typeof tree !== "object") return undefined;
  if (tree.type === "button" && tree.props.children.trim() === label) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const found = button(child, label); if (found) return found; }
}

describe("Browser installation prompt", () => {
  it("awaits userChoice after prompt resolves without a return value", async () => {
    const app = harness(), prompt = vi.fn(async () => undefined);
    app.emit({ preventDefault: vi.fn(), prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    await button(app.render(), "Install").props.onClick();
    expect(prompt).toHaveBeenCalledOnce(); expect(app.values[2]).toBe(true);
    expect(app.render()).toBeNull();
  });
  it("honors a dismissed prompt for the rest of the browser session", () => {
    const app = harness(true);
    app.emit({ preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "dismissed" }) });
    expect(app.render()).toBeNull();
  });
  it("dismisses without invoking the browser installation action", () => {
    const app = harness(), prompt = vi.fn();
    app.emit({ preventDefault: vi.fn(), prompt, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    button(app.render(), "Not now").props.onClick();
    expect(app.render()).toBeNull(); expect(prompt).not.toHaveBeenCalled();
  });
});
