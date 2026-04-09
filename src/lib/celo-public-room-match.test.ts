import { describe, it, expect } from "vitest";
import { matchPublicCeloRoomByUuidPrefix } from "@/lib/celo-public-room-match";

describe("matchPublicCeloRoomByUuidPrefix (lookup / cross-device code)", () => {
  it("matches first 8 hex chars of UUID (no dashes)", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const prefix = "A1B2C3D4";
    const r = matchPublicCeloRoomByUuidPrefix([{ id, status: "waiting", room_type: "public" }], prefix);
    expect(r?.id).toBe(id);
    expect(r?.status).toBe("waiting");
  });

  it("returns null when no joinable status", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(matchPublicCeloRoomByUuidPrefix([{ id, status: "completed", room_type: "public" }], "A1B2C3D4")).toBeNull();
  });

  it("returns the first list row that matches prefix (API returns recent-first)", () => {
    const first = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
    const second = "11111111-bbbb-4222-8222-bbbbbbbbbbbb";
    const r = matchPublicCeloRoomByUuidPrefix(
      [
        { id: first, status: "waiting", room_type: "public" },
        { id: second, status: "waiting", room_type: "public" },
      ],
      "11111111"
    );
    expect(r?.id).toBe(first);
  });
});
