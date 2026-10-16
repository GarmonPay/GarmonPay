export const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function assertUsernameChange(input: {
  currentHandle: string;
  nextHandle: string | null;
  walletAddress: string;
  recordedWalletAddress: string;
  lastChangedAt: string | null;
  nowMs: number;
}) {
  if (input.recordedWalletAddress !== input.walletAddress) {
    throw new Error("A public username change cannot change the wallet identity.");
  }
  if (!input.nextHandle || input.nextHandle === input.currentHandle) return { changed: false as const };
  if (input.lastChangedAt) {
    const last = Date.parse(input.lastChangedAt);
    if (!Number.isFinite(last) || input.nowMs < last) throw new Error("The username history could not be verified. The current username was kept.");
    const availableAt = last + USERNAME_COOLDOWN_MS;
    if (input.nowMs < availableAt) {
      throw new Error(`This public username can change again after ${new Date(availableAt).toISOString().slice(0, 10)}. The wallet address stays the same.`);
    }
  }
  return { changed: true as const, walletAddress: input.walletAddress };
}
