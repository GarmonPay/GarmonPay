export type CeloRoundRollResult = {
  ok: boolean;
  message: string;
};

export function rollCeloRound(): CeloRoundRollResult {
  return {
    ok: false,
    message: "CELO round engine is not implemented.",
  };
}
