/** Browser health pings consume only a sanitized public origin; deployment
 * environment values are resolved on the server and never bundled here.
 */
export function startKeepAlive(): () => void {
  if (typeof window === "undefined") return () => {};
  let active: AbortController | null = null;
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  async function ping(base: string) {
    if (stopped || active) return;
    const controller = new AbortController(); active = controller;
    const timeout = setTimeout(() => controller.abort(), 55000); requestTimeout = timeout;
    try {
      // Opaque GET sends no credentials and reads no worker response data.
      await fetch(`${base}/health`, { signal: controller.signal, credentials: "omit", mode: "no-cors", cache: "no-store" });
    } catch { /* Best-effort transport check, never financial certification. */ }
    finally { clearTimeout(timeout); if (requestTimeout === timeout) requestTimeout = null; if (active === controller) active = null; }
  }
  async function initialize() {
    const controller = new AbortController(); active = controller;
    const timeout = setTimeout(() => controller.abort(), 8000); requestTimeout = timeout;
    let base: string | undefined;
    try {
      const response = await fetch("/api/arena/health-origin", { credentials: "omit", cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.healthOrigin !== "string") return;
      const url = new URL(data.healthOrigin);
      if(url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return;
      base = url.origin;
    } catch { return; }
    finally { clearTimeout(timeout); if(requestTimeout === timeout) requestTimeout = null; if(active === controller) active = null; }
    if (stopped || !base) return;
    void ping(base);
    timer = setInterval(() => void ping(base!), 14 * 60 * 1000);
  }
  void initialize();
  return () => { stopped = true; if(timer) clearInterval(timer); if(requestTimeout) clearTimeout(requestTimeout); active?.abort(); };
}
