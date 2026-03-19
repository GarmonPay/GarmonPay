/**
 * Arena fighter visual and gear types. Used by pages.
 */

const SKIN_TONES_MAP = {
  tone1: "#f5d5b8",
  tone2: "#e8b89a",
  tone3: "#d4956a",
  tone4: "#b8723d",
  tone5: "#8d4a1f",
  tone6: "#5c2e0e",
} as const;

export type BodyType = "lightweight" | "middleweight" | "heavyweight";
export type SkinTone = "tone1" | "tone2" | "tone3" | "tone4" | "tone5" | "tone6";
export type FaceStyle =
  | "determined"
  | "fierce"
  | "calm"
  | "angry"
  | "scarred"
  | "young"
  | "veteran"
  | "masked";
export type HairStyle =
  | "bald"
  | "short_fade"
  | "dreads"
  | "cornrows"
  | "afro"
  | "mohawk"
  | "buzz_cut"
  | "long_tied";

export type GearGlovesKey =
  | "default"
  | "wraps"
  | "street_gloves"
  | "pro_gloves"
  | "titanium_gloves"
  | "championship_gloves";
export type GearShoesKey =
  | "default"
  | "bare_feet"
  | "ring_boots"
  | "speed_boots"
  | "power_stompers"
  | "legendary_kicks";
export type GearShortsKey =
  | "default"
  | "street_shorts"
  | "gold_trunks"
  | "diamond_shorts"
  | "champion_trunks";
export type GearHeadgearKey = "none" | "basic" | "pro" | "iron_skull";

export interface FighterData {
  id?: string;
  name: string;
  style?: string;
  avatar?: string;
  body_type?: BodyType;
  skin_tone?: SkinTone;
  face_style?: FaceStyle;
  hair_style?: HairStyle;
  equipped_gloves?: GearGlovesKey | string | null;
  equipped_shoes?: GearShoesKey | string | null;
  equipped_shorts?: GearShortsKey | string | null;
  equipped_headgear?: GearHeadgearKey | string | null;
  fighter_color?: string | null;
  strength?: number;
  speed?: number;
  stamina?: number;
  defense?: number;
  chin?: number;
  special?: number;
  wins?: number;
  losses?: number;
  title?: string | null;
  origin?: string | null;
  win_streak?: number;
  condition?: string | null;
  training_sessions?: number;
  backstory?: string | null;
  [key: string]: unknown;
}

export const DEFAULT_FIGHTER_VISUAL: Pick<
  FighterData,
  "body_type" | "skin_tone" | "face_style" | "hair_style" | "equipped_gloves" | "equipped_shoes" | "equipped_shorts" | "equipped_headgear"
> = {
  body_type: "middleweight",
  skin_tone: "tone3",
  face_style: "determined",
  hair_style: "short_fade",
  equipped_gloves: "default",
  equipped_shoes: "default",
  equipped_shorts: "default",
  equipped_headgear: "none",
};

/** Resolve skin tone string to hex. */
export function getSkinHex(skinTone: string): string {
  const key = skinTone in SKIN_TONES_MAP ? (skinTone as keyof typeof SKIN_TONES_MAP) : "tone3";
  return SKIN_TONES_MAP[key] ?? SKIN_TONES_MAP.tone3;
}

/** Option arrays for manual fighter creation UI */
export const BODY_TYPES = [
  { value: "lightweight" as const, label: "Lightweight" },
  { value: "middleweight" as const, label: "Middleweight" },
  { value: "heavyweight" as const, label: "Heavyweight" },
];
export const SKIN_TONES = [
  { value: "tone1" as const, label: "Tone 1", hex: SKIN_TONES_MAP.tone1 },
  { value: "tone2" as const, label: "Tone 2", hex: SKIN_TONES_MAP.tone2 },
  { value: "tone3" as const, label: "Tone 3", hex: SKIN_TONES_MAP.tone3 },
  { value: "tone4" as const, label: "Tone 4", hex: SKIN_TONES_MAP.tone4 },
  { value: "tone5" as const, label: "Tone 5", hex: SKIN_TONES_MAP.tone5 },
  { value: "tone6" as const, label: "Tone 6", hex: SKIN_TONES_MAP.tone6 },
];
export const FACE_STYLES = [
  { value: "determined" as const, label: "Determined" },
  { value: "fierce" as const, label: "Fierce" },
  { value: "calm" as const, label: "Calm" },
  { value: "angry" as const, label: "Angry" },
  { value: "scarred" as const, label: "Scarred" },
  { value: "young" as const, label: "Young" },
  { value: "veteran" as const, label: "Veteran" },
  { value: "masked" as const, label: "Masked" },
];
export const HAIR_STYLES = [
  { value: "bald" as const, label: "Bald" },
  { value: "short_fade" as const, label: "Short Fade" },
  { value: "dreads" as const, label: "Dreads" },
  { value: "cornrows" as const, label: "Cornrows" },
  { value: "afro" as const, label: "Afro" },
  { value: "mohawk" as const, label: "Mohawk" },
  { value: "buzz_cut" as const, label: "Buzz Cut" },
  { value: "long_tied" as const, label: "Long Tied" },
];
