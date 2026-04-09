/**
 * Temporary QA / ops logging — grep logs for `[celo:qa]` JSON lines. Remove or gate behind
 * env when no longer needed.
 */

export function celoQaLog(event: string, payload: Record<string, unknown> = {}): void {
  console.log(
    "[celo:qa]",
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })
  );
}
