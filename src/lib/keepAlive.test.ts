import { afterEach, describe, expect, it, vi } from "vitest";
import { startKeepAlive } from "./keepAlive";
import { getFightServerHealthUrl } from "./fight-server-config";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Fight-worker public health origin", () => {
  it("uses the explicit HTTP origin, then boxing before legacy arena", () => {
    expect(getFightServerHealthUrl({ http: "https://worker.example", boxing: "wss://boxing.example", arena: "wss://garmonpay.com" })).toBe("https://worker.example");
    expect(getFightServerHealthUrl({ boxing: "wss://boxing.example", arena: "wss://garmonpay.com" })).toBe("https://boxing.example");
  });
  it.each(["http://worker.example", "javascript:alert(1)", "https://user:pass@worker.example", "https://worker.example/?token=x", "https://worker.example/other"])("rejects unsafe or ambiguous origin %s", http => {
    expect(getFightServerHealthUrl({ http })).toBeUndefined();
  });
  it("aborts pending requests and stops timers on unmount", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", {});
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((url: string, options: { signal: AbortSignal }) => {
      if(url === "/api/arena/health-origin")return Promise.resolve({ok:true,json:async()=>({healthOrigin:"https://worker.example"})});
      signal = options.signal; return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetch);
    const stop = startKeepAlive();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2); expect(signal?.aborted).toBe(false);
    expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: "omit", mode: "no-cors" });
    stop(); expect(signal?.aborted).toBe(true); await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
