export type SessionRead = { state: "anonymous" } | { state: "active"; wallet: string } | { state: "temporary"; status: number };

/** A missing session is anonymous. A busy or unavailable lookup is temporary and must not sign the member out. */
export function classifySessionResponse(status: number, body: unknown): SessionRead {
  const wallet = body && typeof body === "object" && "wallet" in body && typeof body.wallet === "string" ? body.wallet : null;
  if (status === 401) return { state: "anonymous" };
  if (status >= 200 && status < 300) return wallet ? { state: "active", wallet } : { state: "anonymous" };
  return { state: "temporary", status };
}

export async function readWalletSession(request: typeof fetch = fetch, wait: (ms: number) => Promise<void> = delay): Promise<SessionRead> {
  let last: SessionRead = { state: "temporary", status: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await request("/api/solana/auth/session", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      const read = classifySessionResponse(response.status, body);
      if (read.state !== "temporary") return read;
      last = read;
    } catch {
      last = { state: "temporary", status: 0 };
    }
    if (attempt < 2) await wait(300 * (attempt + 1));
  }
  return last;
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
