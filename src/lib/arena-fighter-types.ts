/**
 * Arena fighter visual system — types and constants.
 * Used by FighterDisplay and fighter creation flow.
 */

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

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "lightweight", label: "Lightweight" },
  { value: "middleweight", label: "Middleweight" },
  { value: "heavyweight", label: "Heavyweight" },
];

export const SKIN_TONES: { value: SkinTone; label: string; hex: string }[] = [
  { value: "tone1", label: "Light", hex: "#f5d0c5" },
  { value: "tone2", label: "Fair", hex: "#e8b4a0" },
  { value: "tone3", label: "Medium", hex: "#c98b63" },
  { value: "tone4", label: "Olive", hex: "#a67c52" },
  { value: "tone5", label: "Brown", hex: "#6b4423" },
  { value: "tone6", label: "Dark", hex: "#3d2314" },
];

export const FACE_STYLES: { value: FaceStyle; label: string }[] = [
  { value: "determined", label: "Determined" },
  { value: "fierce", label: "Fierce" },
  { value: "calm", label: "Calm" },
  { value: "angry", label: "Angry" },
  { value: "scarred", label: "Scarred" },
  { value: "young", label: "Young" },
  { value: "veteran", label: "Veteran" },
  { value: "masked", label: "Masked" },
];

export const HAIR_STYLES: { value: HairStyle; label: string }[] = [
  { value: "bald", label: "Bald" },
  { value: "short_fade", label: "Short fade" },
  { value: "dreads", label: "Dreads" },
  { value: "cornrows", label: "Cornrows" },
  { value: "afro", label: "Afro" },
  { value: "mohawk", label: "Mohawk" },
  { value: "buzz_cut", label: "Buzz cut" },
  { value: "long_tied", label: "Long tied back" },
];

export type FighterDisplaySize = "small" | "medium" | "large" | "full";
export type FighterAnimation =
  | "idle"
  | "training"
  | "victory"
  | "defeat"
  | "fighting"
  | "special"
  | "hit"
  | "ko";

export interface FighterData {
  id?: string;
  name: string;
  style?: string;
  avatar?: string;
  strength?: number;
  speed?: number;
  stamina?: number;
  defense?: number;
  chin?: number;
  special?: number;
  wins?: number;
  losses?: number;
  title?: string;
  condition?: string;
  win_streak?: number;
  training_sessions?: number;
  body_type?: BodyType | string | null;
  skin_tone?: SkinTone | string | null;
  face_style?: FaceStyle | string | null;
  hair_style?: HairStyle | string | null;
  equipped_gloves?: GearGlovesKey | string | null;
  equipped_shoes?: GearShoesKey | string | null;
  equipped_shorts?: GearShortsKey | string | null;
  equipped_headgear?: GearHeadgearKey | string | null;
  equipped_gloves_key?: GearGlovesKey | string | null;
  equipped_shoes_key?: GearShoesKey | string | null;
  equipped_shorts_key?: GearShortsKey | string | null;
  equipped_headgear_key?: GearHeadgearKey | string | null;
  [key: string]: unknown;
}

export const DEFAULT_FIGHTER_VISUAL: Pick<
  FighterData,
  "body_type" | "skin_tone" | "face_style" | "hair_style"
> = {
  body_type: "middleweight",
  skin_tone: "tone3",
  face_style: "determined",
  hair_style: "short_fade",
};

export function getSkinHex(tone: string | null | undefined): string {
  const t = SKIN_TONES.find((x) => x.value === tone);
  return t?.hex ?? SKIN_TONES[2].hex;
}
