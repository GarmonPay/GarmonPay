import { describe, expect, it } from "vitest";
import {
  roomFlagPatchAfterRoundComplete,
  statusAfterRoundForBank,
} from "./celo-room-status";
import { zeroBankFundReference } from "./celo-fund-zero-bank";

describe("statusAfterRoundForBank", () => {
  it("keeps a positive bank in waiting", () => {
    expect(
      statusAfterRoundForBank({
        current_bank_sc: 5000,
        banker_id: "banker-1",
      })
    ).toBe("waiting");
  });

  it("opens takeover when the bank is empty and a banker remains", () => {
    expect(
      statusAfterRoundForBank({
        current_bank_sc: 0,
        banker_id: "winner-1",
        bank_busted: false,
      } as { current_bank_sc: number; banker_id: string })
    ).toBe("bank_takeover");
  });

  it("does not assign takeover when nobody owns the bank", () => {
    expect(
      statusAfterRoundForBank({
        current_bank_sc: 0,
        banker_id: null,
      })
    ).toBe("waiting");
  });
});

describe("roomFlagPatchAfterRoundComplete", () => {
  it("marks the bust flag only for takeover", () => {
    expect(roomFlagPatchAfterRoundComplete("bank_takeover")).toEqual({
      status: "bank_takeover",
      bank_busted: true,
    });
    expect(roomFlagPatchAfterRoundComplete("waiting")).toEqual({
      status: "waiting",
    });
  });
});

describe("zeroBankFundReference", () => {
  it("is stable for the same room, banker, and completed-round count", () => {
    const a = zeroBankFundReference("room", "winner", 4);
    const b = zeroBankFundReference("room", "winner", 4);
    expect(a).toBe(b);
    expect(zeroBankFundReference("room", "winner", 5)).not.toBe(a);
    expect(zeroBankFundReference("room", "other", 4)).not.toBe(a);
  });
});
