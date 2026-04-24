import { describe, expect, it } from "vitest";
import { shouldClobberFeltTripletOnFetch } from "./celo-room-dice";

describe("shouldClobberFeltTripletOnFetch", () => {
  it("does not clobber while a roll action is in flight (defensive)", () => {
    expect(
      shouldClobberFeltTripletOnFetch({
        rollingActionInProgress: true,
        activeStatus: "banker_rolling",
        serverHasBankerTriplet: false,
        hasPlayerFinalWinLoss: false,
        hasLocalFeltTriplet: true,
        localFeltTiedToThisRound: true,
      })
    ).toBe(false);
  });

  it("preserves when banker_rolling, server has no banker_dice yet, and client holds a tied triplet", () => {
    expect(
      shouldClobberFeltTripletOnFetch({
        rollingActionInProgress: false,
        activeStatus: "banker_rolling",
        serverHasBankerTriplet: false,
        hasPlayerFinalWinLoss: false,
        hasLocalFeltTriplet: true,
        localFeltTiedToThisRound: true,
      })
    ).toBe(false);
  });

  it("preserves player_rolling mid-reroll when there is a local triplet and no final win/loss", () => {
    expect(
      shouldClobberFeltTripletOnFetch({
        rollingActionInProgress: false,
        activeStatus: "player_rolling",
        serverHasBankerTriplet: true,
        hasPlayerFinalWinLoss: false,
        hasLocalFeltTriplet: true,
        localFeltTiedToThisRound: true,
      })
    ).toBe(false);
  });

  it("clobbers when there is no local triplet", () => {
    expect(
      shouldClobberFeltTripletOnFetch({
        rollingActionInProgress: false,
        activeStatus: "banker_rolling",
        serverHasBankerTriplet: false,
        hasPlayerFinalWinLoss: false,
        hasLocalFeltTriplet: false,
        localFeltTiedToThisRound: false,
      })
    ).toBe(true);
  });
});
