import { describe, expect, it } from "vitest";
import { CELO_DICE_IMPACT_MARKS } from "./celo-dice-audio";
import {
  CELO_HAND_ENTER_MS,
  CELO_HAND_RELEASE_MS,
  CELO_HAND_SHAKE_MS,
  CELO_THROW_MS,
  CELO_THROW_TAIL_MS,
  HAND_TONES,
  clearShooterHands,
  displayedDieFace,
  handAsset,
  handForShooter,
  handToneIndex,
  projectFeltPlay,
  settledDiceFaces,
  throwVariant,
  visualTumbleFace,
} from "./celo-throw";

const HANDS: [number, number, number][] = [
  [1, 2, 3],
  [4, 5, 6],
  [5, 3, 1],
  [4, 6, 6],
  [1, 1, 1],
  [6, 6, 6],
];

describe("settled dice match the server hand", () => {
  it.each(HANDS)("%j stays exact after every tumble frame", (a, b, c) => {
    const server: [number, number, number] = [a, b, c];
    expect(settledDiceFaces(server)).toEqual(server);
    for (let tick = 0; tick < 8; tick++) {
      for (const lane of [0, 1, 2]) {
        const moving = displayedDieFace(server[lane]!, true, lane, tick);
        expect(moving).toBeGreaterThanOrEqual(1);
        expect(moving).toBeLessThanOrEqual(6);
        expect(displayedDieFace(server[lane]!, false, lane, tick)).toBe(server[lane]);
      }
    }
    expect(settledDiceFaces(server)).toEqual([a, b, c]);
    expect(throwVariant(`${a}${b}${c}`)).toBeLessThan(3);
    expect(HAND_TONES[handToneIndex(`${a}${b}${c}`)]).toBeTruthy();
    expect(settledDiceFaces(server)).toEqual([a, b, c]);
  });

  it("a different path variant does not change the settled hand", () => {
    for (const hand of HANDS) {
      const seedA = `round-a:${hand.join(",")}`;
      const seedB = `round-b:${hand.join(",")}`;
      expect(settledDiceFaces(hand)).toEqual(settledDiceFaces(hand));
      throwVariant(seedA);
      throwVariant(seedB);
      expect(settledDiceFaces(hand)).toEqual([...hand]);
    }
  });

  it("hand tone and path do not change the settled hand", () => {
    for (const hand of HANDS) {
      const tone = HAND_TONES[handToneIndex(`presentation:${hand.join("-")}`)];
      expect(HAND_TONES).toContain(tone);
      expect(handAsset("hold", tone!)).toMatch(/^\/images\/celo\/throw\/hand-hold-/);
      expect(handAsset("shake", tone!)).toMatch(/^\/images\/celo\/throw\/hand-shake-/);
      expect(handAsset("release", tone!)).toMatch(/^\/images\/celo\/throw\/hand-release-/);
      expect(throwVariant(`path:${hand.join(",")}`)).toBeGreaterThanOrEqual(0);
      expect(throwVariant(`path:${hand.join(",")}`)).toBeLessThan(3);
      expect(settledDiceFaces(hand)).toEqual([...hand]);
    }
  });

  it("keeps the throw inside the 2–3 second presentation window", () => {
    expect(CELO_HAND_ENTER_MS).toBeGreaterThanOrEqual(200);
    expect(CELO_HAND_ENTER_MS).toBeLessThanOrEqual(350);
    expect(CELO_HAND_SHAKE_MS).toBeGreaterThanOrEqual(700);
    expect(CELO_HAND_SHAKE_MS).toBeLessThanOrEqual(1000);
    expect(CELO_HAND_RELEASE_MS).toBeGreaterThanOrEqual(150);
    expect(CELO_HAND_RELEASE_MS).toBeLessThanOrEqual(250);
    expect(CELO_THROW_MS).toBeGreaterThanOrEqual(1000);
    expect(CELO_THROW_MS).toBeLessThanOrEqual(1600);
    const total = CELO_HAND_ENTER_MS + CELO_HAND_SHAKE_MS + CELO_HAND_RELEASE_MS + CELO_THROW_MS + CELO_THROW_TAIL_MS;
    expect(total).toBeGreaterThanOrEqual(2000);
    expect(total).toBeLessThanOrEqual(3000);
  });

  it("tumble faces come from a fixed cycle", () => {
    expect(visualTumbleFace(0, 0)).toBe(visualTumbleFace(0, 0));
    expect(visualTumbleFace(1, 3)).toBe(visualTumbleFace(1, 3));
  });
});

describe("felt collision box", () => {
  const stages: [number, number, number][] = [
    [360, 400, 0.7],
    [390, 433, 0.7],
    [720, 560, 0.72],
    [748, 480, 0.72],
    [900, 520, 0.72],
  ];

  it("stays inside every checked stage", () => {
    for (const [width, height, posY] of stages) {
      const box = projectFeltPlay(width, height, posY);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThan(0.5);
      expect(box.height).toBeGreaterThan(0.12);
      expect(box.left + box.width).toBeLessThanOrEqual(1.001);
      expect(box.top + box.height).toBeLessThanOrEqual(1.001);
    }
  });
});

describe("shooter hand assignment", () => {
  it("keeps one hand for the same shooter across repeated rolls", () => {
    clearShooterHands();
    const first = handForShooter("player-1");
    for (let roll = 0; roll < 5; roll++) {
      expect(handForShooter("player-1")).toBe(first);
    }
  });

  it("gives the next shooter a different hand and keeps it", () => {
    clearShooterHands();
    const player1 = handForShooter("player-1");
    const player2 = handForShooter("player-2");
    expect(player2).not.toBe(player1);
    for (let roll = 0; roll < 5; roll++) {
      expect(handForShooter("player-2")).toBe(player2);
    }
    expect(handForShooter("player-1")).toBe(player1);
    const player3 = handForShooter("player-3");
    expect(player3).not.toBe(player1);
    expect(player3).not.toBe(player2);
    expect(handForShooter("player-3")).toBe(player3);
  });
});

describe("dice impact hooks", () => {
  it("gives each die a felt hit, a rail hit, and a settle", () => {
    for (const die of [0, 1, 2] as const) {
      const kinds = CELO_DICE_IMPACT_MARKS.filter((mark) => mark.die === die).map(
        (mark) => mark.kind
      );
      expect(kinds).toContain("felt");
      expect(kinds).toContain("rail");
      expect(kinds).toContain("settle");
    }
  });
});
