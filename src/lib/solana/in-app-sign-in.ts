import type { WalletApp, WalletSurface } from "./wallet-environment";

export const PROVIDER_POLL_MS = 250;
export const PROVIDER_WAIT_MS = 5000;
export const PROVIDER_READY_EVENTS = ["phantom#initialized", "load"] as const;

export type InAppDecision = "sign-phantom" | "sign-solflare" | "wait" | "none";

export const AUTH_STAGE_ERRORS = {
  provider: "Phantom wallet not detected. Close and reopen this page in Phantom.",
  connect: "Phantom rejected the connection request.",
  sign: "Phantom rejected the sign-in message.",
  verify: "Signature verification failed.",
  session: "The signature was approved, but the sign-in session was not created.",
  profile: "Your session was created, but the member profile could not be loaded.",
} as const;

export function signedInNotice(app: WalletApp, profileLoaded: boolean): string {
  return app === "phantom" && profileLoaded ? "Signed in. You are signed in inside Phantom's browser. Safari stays separate." : "";
}

/** Inside Phantom, a missing gp_wallet hint still offers sign-in. It never connects by itself. */
export function inAppDecision(input: { hint: WalletApp | null; insideWallet: boolean; surface: WalletSurface; phantom: boolean; solflare: boolean; hasSession: boolean }): InAppDecision {
  if (input.hasSession) return "none";
  if (input.surface === "desktop" && !input.hint) return "none";
  if (!input.insideWallet && !input.hint) return "none";
  if (input.phantom && input.hint !== "solflare") return "sign-phantom";
  if (input.solflare && input.hint !== "phantom") return "sign-solflare";
  return "wait";
}

export async function pollProvider(input: {
  read: () => { phantom: boolean; solflare: boolean };
  wait: (ms: number) => Promise<void>;
  clock?: () => number;
  pollMs?: number;
  timeoutMs?: number;
  shouldStop?: () => boolean;
}): Promise<"phantom" | "solflare" | "timeout" | "stopped"> {
  const clock = input.clock ?? Date.now;
  const pollMs = input.pollMs ?? PROVIDER_POLL_MS;
  const timeoutMs = input.timeoutMs ?? PROVIDER_WAIT_MS;
  const started = clock();
  for (;;) {
    if (input.shouldStop?.()) return "stopped";
    const found = input.read();
    if (input.shouldStop?.()) return "stopped";
    if (found.phantom) return "phantom";
    if (found.solflare) return "solflare";
    if (clock() - started >= timeoutMs) return "timeout";
    await input.wait(pollMs);
  }
}
