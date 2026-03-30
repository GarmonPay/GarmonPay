import type { BodyType, FaceStyle, HairStyle } from "@/lib/arena-fighter-types";
import { getSkinHex } from "@/lib/arena-fighter-types";
import { safeDisplayName } from "@/lib/arena-safe-fighter";
import {
  BODY_SCALE_BY_TYPE,
  resolveAccessoryAssetUrl,
  resolveBodyAssetUrl,
  resolveFaceAssetUrl,
  resolveGlovesAssetUrl,
  resolveHairAssetUrl,
  resolveShoesAssetUrl,
  resolveShortsAssetUrl,
} from "@/lib/fighter-avatar-assets";

function mixHex(hex: string, target: "#ffffff" | "#000000", amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const tr = target === "#ffffff" ? 255 : 0;
  const tg = target === "#ffffff" ? 255 : 0;
  const tb = target === "#ffffff" ? 255 : 0;
  const m = Math.max(0, Math.min(1, amount));
  const R = Math.round(r + (tr - r) * m);
  const G = Math.round(g + (tg - g) * m);
  const B = Math.round(b + (tb - b) * m);
  return `#${[R, G, B].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Light / dark gradient stops for body SVG placeholders `SKIN_LIGHT` / `SKIN_DARK`. */
export function skinGradientFromTone(skinTone: string | undefined): { light: string; dark: string } {
  const base = getSkinHex(typeof skinTone === "string" ? skinTone : "tone3");
  return {
    light: mixHex(base, "#ffffff", 0.2),
    dark: mixHex(base, "#000000", 0.28),
  };
}

export function mapBodyType(raw: unknown): BodyType {
  const b = typeof raw === "string" ? raw : "";
  if (b === "lightweight" || b === "middleweight" || b === "heavyweight") return b;
  return "middleweight";
}

export function mapFaceStyle(raw: unknown): FaceStyle {
  const f = typeof raw === "string" ? raw : "";
  const allowed: FaceStyle[] = [
    "determined",
    "fierce",
    "calm",
    "angry",
    "scarred",
    "young",
    "veteran",
    "masked",
  ];
  return (allowed.includes(f as FaceStyle) ? f : "determined") as FaceStyle;
}

export function mapHairStyle(raw: unknown): HairStyle {
  const h = typeof raw === "string" ? raw : "";
  const allowed: HairStyle[] = [
    "bald",
    "short_fade",
    "dreads",
    "cornrows",
    "afro",
    "mohawk",
    "buzz_cut",
    "long_tied",
  ];
  return (allowed.includes(h as HairStyle) ? h : "short_fade") as HairStyle;
}

export type LayeredFighterAvatarConfig = {
  bodyType: BodyType;
  bodyScale: number;
  skinLight: string;
  skinDark: string;
  trunksColor: string;
  gloveColor: string;
  bodyUrl: string;
  shortsUrl: string;
  shoesUrl: string;
  glovesUrl: string;
  faceUrl: string;
  hairUrl: string;
  accessoryUrl: string;
  name: string;
};

export function fighterRecordToLayeredAvatarConfig(
  fighter: Record<string, unknown>,
  trunksColor: string,
): LayeredFighterAvatarConfig {
  const bodyType = mapBodyType(fighter.body_type);
  const { light, dark } = skinGradientFromTone(
    typeof fighter.skin_tone === "string" ? fighter.skin_tone : undefined
  );
  const face = mapFaceStyle(fighter.face_style);
  const hair = mapHairStyle(fighter.hair_style);
  const glove =
    typeof trunksColor === "string" && trunksColor.startsWith("#") ? trunksColor : "#f0a500";

  return {
    bodyType,
    bodyScale: BODY_SCALE_BY_TYPE[bodyType],
    skinLight: light,
    skinDark: dark,
    trunksColor: trunksColor.startsWith("#") ? trunksColor : "#f0a500",
    gloveColor: glove,
    bodyUrl: resolveBodyAssetUrl(bodyType),
    shortsUrl: resolveShortsAssetUrl(fighter.equipped_shorts),
    shoesUrl: resolveShoesAssetUrl(fighter.equipped_shoes),
    glovesUrl: resolveGlovesAssetUrl(fighter.equipped_gloves),
    faceUrl: resolveFaceAssetUrl(face),
    hairUrl: resolveHairAssetUrl(hair),
    accessoryUrl: resolveAccessoryAssetUrl(fighter.equipped_headgear),
    name: safeDisplayName(fighter.name, "Fighter").slice(0, 22),
  };
}

export function layeredAvatarHeightForSize(size: "small" | "medium" | "large"): number {
  switch (size) {
    case "small":
      return 220;
    case "large":
      return 560;
    default:
      return 380;
  }
}
