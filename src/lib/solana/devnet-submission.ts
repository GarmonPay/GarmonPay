/** Preserve the public chain ID when confirmation fails after a broadcast. */
export class DevnetSubmissionError extends Error {
  constructor(readonly signature: string) { super("Devnet submission occurred, but confirmation or account verification is incomplete. Check the transaction before retrying."); }
}
export async function afterDevnetBroadcast<T>(signature: string, verify: () => Promise<T>): Promise<T> {
  try { return await verify(); } catch { throw new DevnetSubmissionError(signature); }
}
