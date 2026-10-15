import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectArtwork } from "./artwork-image";
import { artworkPrompt } from "./artwork-prompt";
import { isDraftId, isStoredArtworkUrl } from "./artwork-store";

describe("ChatGPT artwork prompt", () => {
  it("builds a prompt from the member's token", () => {
    const prompt = artworkPrompt({
      name: "Golden Lion",
      symbol: "GLION",
      description: "A majestic golden lion wearing a royal purple crown.",
      concept: "A majestic golden lion wearing a royal purple crown",
    });
    expect(prompt).toContain("Golden Lion");
    expect(prompt).toContain("GLION");
    expect(prompt.match(/A majestic golden lion/g)?.length).toBe(1);
    expect(prompt).toContain("Do not include watermarks");
    expect(prompt).not.toContain("..");
    expect(prompt).not.toContain("http");
  });
  it("changes when the concept changes", () => {
    const first = artworkPrompt({ name: "Glass Orchard", symbol: "GLORCH", concept: "crystal pear trees" });
    const second = artworkPrompt({ name: "Glass Orchard", symbol: "GLORCH", concept: "a lantern over water" });
    expect(first).not.toBe(second);
  });
});

describe("artwork upload checks", () => {
  it("accepts a small png and rejects a text file", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#6b21a8" } }).png().toBuffer();
    const checked = await inspectArtwork(png);
    expect(checked.format).toBe("png");
    expect(checked.width).toBe(64);
    await expect(inspectArtwork(new Uint8Array(Buffer.from("not an image")))).rejects.toThrow(/PNG, JPEG, or WebP/);
  });
  it("rejects an oversized dimension", async () => {
    const wide = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#111111" } }).png().toBuffer();
    await expect(inspectArtwork(wide)).rejects.toThrow(/64 and 2048/);
  });
  it("only accepts this project's public artwork address", () => {
    const host = "https://example.supabase.co";
    expect(isDraftId("a".repeat(32))).toBe(true);
    expect(isDraftId("short")).toBe(false);
    expect(isStoredArtworkUrl(`${host}/storage/v1/object/public/garmonpay-token-art/abc.png`, host)).toBe(true);
    expect(isStoredArtworkUrl("https://evil.example/storage/v1/object/public/garmonpay-token-art/abc.png", host)).toBe(false);
    expect(isStoredArtworkUrl("data:image/png;base64,aaaa", host)).toBe(false);
  });
});
