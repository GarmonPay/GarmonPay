import type { Boxer2DBodyType, Boxer2DHairStyle, Boxer2DSkinTone } from "@/components/arena/Boxer2D";
import { safeDisplayName } from "@/lib/arena-safe-fighter";

/** Map arena `skin_tone` (tone1–6) to Boxer2D palette. */
export function mapSkinToneToBoxer2D(raw: unknown): Boxer2DSkinTone {
  const t = typeof raw === "string" ? raw : "";
  switch (t) {
    case "tone1":
    case "tone2":
      return "light";
    case "tone3":
      return "medium";
    case "tone4":
      return "tan";
    case "tone5":
      return "dark";
    case "tone6":
      return "deep";
    default:
      return "medium";
  }
}

/** Map arena hair_style enum to Boxer2D hair options. */
export function mapHairToBoxer2D(raw: unknown): Boxer2DHairStyle {
  const h = typeof raw === "string" ? raw : "";
  switch (h) {
    case "bald":
      return "bald";
    case "short_fade":
      return "fade";
    case "dreads":
      return "dreads";
    case "cornrows":
      return "cornrows";
    case "afro":
      return "afro";
    case "mohawk":
      return "mohawk";
    case "buzz_cut":
      return "buzz";
    case "long_tied":
      return "long";
    default:
      return "fade";
  }
}

export function mapBodyTypeToBoxer2D(raw: unknown): Boxer2DBodyType {
  const b = typeof raw === "string" ? raw : "";
  if (b === "lightweight" || b === "middleweight" || b === "heavyweight") return b;
  return "middleweight";
}

export function boxer2DCanvasDimensions(size: "small" | "medium" | "large"): { width: number; height: number } {
  switch (size) {
    case "small":
      return { width: 176, height: 272 };
    case "large":
      return { width: 264, height: 408 };
    default:
      return { width: 220, height: 340 };
  }
}

export function fighterRecordToBoxer2DProps(
  fighter: Record<string, unknown>,
  trunksColor: string,
  size: "small" | "medium" | "large"
) {
  const { width, height } = boxer2DCanvasDimensions(size);
  return {
    skinTone: mapSkinToneToBoxer2D(fighter.skin_tone),
    trunksColor,
    hairStyle: mapHairToBoxer2D(fighter.hair_style),
    bodyType: mapBodyTypeToBoxer2D(fighter.body_type),
    name: safeDisplayName(fighter.name, "Fighter").slice(0, 22),
    animate: true as const,
    width,
    height,
  };
}
