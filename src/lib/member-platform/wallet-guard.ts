/** Rejects staging IDs and client-claimed members that are not the signed session. */
export function assertSessionActor(input: {
  sessionMemberId: string | null;
  claimedMemberId?: string | null;
  stagingId?: string | null;
}) {
  if (input.stagingId) throw new Error("A staging ID is not a wallet session.");
  if (!input.sessionMemberId) throw new Error("Connect and sign in with your wallet. A saved browser ID is not a member account.");
  if (input.claimedMemberId && input.claimedMemberId !== input.sessionMemberId) {
    throw new Error("That profile does not match the signed wallet session.");
  }
  return input.sessionMemberId;
}

export function reviewedSchemaMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = `${error.code ?? ""} ${error.message ?? ""}`;
  return error.code === "PGRST202" || /does not exist|schema cache|Could not find the function/i.test(message);
}

export const PAPER_PERSISTENCE_MESSAGE = "Paper trading and advertising drafts save after the reviewed member database is approved. Nothing was recorded, and no real funds moved.";
