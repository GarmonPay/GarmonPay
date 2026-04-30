import { describe, expect, it } from "vitest";
import {
  computeCeloVisualDiceMode,
  getVisibleDiceFromServer,
  shouldClobberFeltTripletOnFetch,
} from "./celo-room-dice";

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

  it("does not clobber during completed-round result pause while local triplet is tied to round", () => {
    expect(
      shouldClobberFeltTripletOnFetch({
        rollingActionInProgress: false,
        activeStatus: "completed",
        serverHasBankerTriplet: true,
        hasPlayerFinalWinLoss: false,
        hasLocalFeltTriplet: true,
        localFeltTiedToThisRound: true,
      })
    ).toBe(false);
  });
});

describe("getVisibleDiceFromServer", () => {
  const roller = "user-roller";

  it("banker in flight → no triplet", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "banker_rolling",
        banker_roll_in_flight: true,
        banker_dice: [6, 6, 6],
      },
      [],
      { rollerUserId: null }
    );
    expect(v.triplet).toBeNull();
    expect(v.source).toBe("banker_in_flight");
  });

  it("banker settled → banker dice", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "banker_rolling",
        banker_roll_in_flight: false,
        banker_dice: [2, 4, 4],
      },
      [],
      { rollerUserId: null }
    );
    expect(v.triplet).toEqual([2, 4, 4]);
    expect(v.source).toBe("banker_round");
  });

  it("banker rolling, no real dice yet → idle_preview_dice for all viewers", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "banker_rolling",
        banker_roll_in_flight: false,
        banker_dice: null,
        idle_preview_dice: [3, 1, 6],
      },
      [],
      { rollerUserId: null }
    );
    expect(v.triplet).toEqual([3, 1, 6]);
    expect(v.source).toBe("banker_idle_preview");
  });

  it("banker_dice wins over idle_preview when both present", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "banker_rolling",
        banker_roll_in_flight: false,
        banker_dice: [2, 2, 2],
        idle_preview_dice: [3, 1, 6],
      },
      [],
      { rollerUserId: null }
    );
    expect(v.triplet).toEqual([2, 2, 2]);
    expect(v.source).toBe("banker_round");
  });

  it("player roll_processing → banker triplet for observers", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "player_rolling",
        roll_processing: true,
        banker_dice: [3, 3, 5],
      },
      [],
      { rollerUserId: roller }
    );
    expect(v.triplet).toEqual([3, 3, 5]);
    expect(v.source).toBe("player_anim_banker_bg");
  });

  it("player phase → current roller row wins", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "player_rolling",
        roll_processing: false,
        banker_dice: [1, 2, 3],
      },
      [
        {
          id: "r1",
          user_id: roller,
          dice: [6, 6, 4],
          outcome: "win",
        },
      ],
      { rollerUserId: roller }
    );
    expect(v.triplet).toEqual([6, 6, 4]);
    expect(v.rollId).toBe("r1");
    expect(v.source).toBe("player_roll");
  });

  it("completed → newest resolved player roll", () => {
    const v = getVisibleDiceFromServer(
      {
        status: "completed",
        banker_dice: [1, 1, 1],
      },
      [
        {
          id: "r2",
          user_id: "p2",
          dice: [4, 4, 2],
          outcome: "loss",
        },
        {
          id: "r1",
          user_id: "p1",
          dice: [5, 5, 5],
          outcome: "win",
        },
      ],
      { rollerUserId: null }
    );
    expect(v.triplet).toEqual([4, 4, 2]);
    expect(v.source).toBe("completed_player");
  });
});

describe("computeCeloVisualDiceMode", () => {
  const base = {
    inProgress: true,
    roundStatus: "banker_rolling",
    roundHasBankerTriplet: false,
    currentPlayerHasFinalRoll: false,
    rollingAction: false,
    localRolling: false,
    serverBankerInFlight: false,
    serverPlayerInFlight: false,
  };

  it("banker_rolling with felt triplet (e.g. idle preview) → settled, not tumble", () => {
    expect(
      computeCeloVisualDiceMode({
        ...base,
        feltTripletPresent: true,
      })
    ).toBe("banker_settled");
  });

  it("banker_rolling only tumbles when roll in flight or local rolling", () => {
    expect(
      computeCeloVisualDiceMode({
        ...base,
        feltTripletPresent: false,
        serverBankerInFlight: true,
      })
    ).toBe("banker_tumble");
    expect(
      computeCeloVisualDiceMode({
        ...base,
        feltTripletPresent: false,
        rollingAction: true,
      })
    ).toBe("banker_tumble");
  });

  it("banker_rolling no dice and no felt → idle (no infinite tumble)", () => {
    expect(
      computeCeloVisualDiceMode({
        ...base,
        feltTripletPresent: false,
      })
    ).toBe("idle");
  });
});
