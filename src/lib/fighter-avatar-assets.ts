import type {
  BodyType,
  FaceStyle,
  GearGlovesKey,
  GearHeadgearKey,
  GearShoesKey,
  GearShortsKey,
  HairStyle,
} from "@/lib/arena-fighter-types";

/** Swap to `png` after adding matching basenames under `public/fighters/**`. */
export const FIGHTER_ASSET_FORMAT: "svg" | "png" = "svg";

export function fighterAssetFile(folder: string, basename: string): string {
  return `/fighters/${folder}/${basename}.${FIGHTER_ASSET_FORMAT}`;
}

export const BODY_SCALE_BY_TYPE: Record<BodyType, number> = {
  lightweight: 0.92,
  middleweight: 1,
  heavyweight: 1.08,
};

export const LAYERED_AVATAR_BODY_BASENAME = "body_middleweight";

export const FACE_ASSET_BASENAME: Record<FaceStyle, string> = {
  determined: "face_determined",
  fierce: "face_fierce",
  calm: "face_calm",
  angry: "face_angry",
  scarred: "face_scarred",
  young: "face_young",
  veteran: "face_veteran",
  masked: "face_masked",
};

export const HAIR_ASSET_BASENAME: Record<HairStyle, string> = {
  bald: "hair_bald",
  short_fade: "hair_short_fade",
  dreads: "hair_dreads",
  cornrows: "hair_cornrows",
  afro: "hair_afro",
  mohawk: "hair_mohawk",
  buzz_cut: "hair_buzz_cut",
  long_tied: "hair_long_tied",
};

const DEFAULT_SHORTS = "shorts_default";
const DEFAULT_GLOVES = "gloves_default";
const DEFAULT_SHOES = "shoes_default";
const DEFAULT_ACCESSORY = "accessory_none";

const SHORTS_BY_GEAR: Partial<Record<GearShortsKey, string>> = {
  default: DEFAULT_SHORTS,
  street_shorts: DEFAULT_SHORTS,
  gold_trunks: DEFAULT_SHORTS,
  diamond_shorts: DEFAULT_SHORTS,
  champion_trunks: DEFAULT_SHORTS,
};

const GLOVES_BY_GEAR: Partial<Record<GearGlovesKey, string>> = {
  default: DEFAULT_GLOVES,
  wraps: DEFAULT_GLOVES,
  street_gloves: DEFAULT_GLOVES,
  pro_gloves: DEFAULT_GLOVES,
  titanium_gloves: DEFAULT_GLOVES,
  championship_gloves: DEFAULT_GLOVES,
};

const SHOES_BY_GEAR: Partial<Record<GearShoesKey, string>> = {
  default: DEFAULT_SHOES,
  bare_feet: DEFAULT_SHOES,
  ring_boots: DEFAULT_SHOES,
  speed_boots: DEFAULT_SHOES,
  power_stompers: DEFAULT_SHOES,
  legendary_kicks: DEFAULT_SHOES,
};

const ACCESSORY_BY_GEAR: Partial<Record<GearHeadgearKey, string>> = {
  none: DEFAULT_ACCESSORY,
  basic: DEFAULT_ACCESSORY,
  pro: DEFAULT_ACCESSORY,
  iron_skull: DEFAULT_ACCESSORY,
};

export function resolveBodyAssetUrl(_bodyType: BodyType): string {
  return fighterAssetFile("body", LAYERED_AVATAR_BODY_BASENAME);
}

export function resolveFaceAssetUrl(face: FaceStyle): string {
  const base = FACE_ASSET_BASENAME[face] ?? FACE_ASSET_BASENAME.determined;
  return fighterAssetFile("face", base);
}

export function resolveHairAssetUrl(hair: HairStyle): string {
  const base = HAIR_ASSET_BASENAME[hair] ?? HAIR_ASSET_BASENAME.short_fade;
  return fighterAssetFile("hair", base);
}

export function resolveShortsAssetUrl(key: unknown): string {
  const k = typeof key === "string" ? (key as GearShortsKey) : "default";
  const base = SHORTS_BY_GEAR[k] ?? DEFAULT_SHORTS;
  return fighterAssetFile("shorts", base);
}

export function resolveGlovesAssetUrl(key: unknown): string {
  const k = typeof key === "string" ? (key as GearGlovesKey) : "default";
  const base = GLOVES_BY_GEAR[k] ?? DEFAULT_GLOVES;
  return fighterAssetFile("gloves", base);
}

export function resolveShoesAssetUrl(key: unknown): string {
  const k = typeof key === "string" ? (key as GearShoesKey) : "default";
  const base = SHOES_BY_GEAR[k] ?? DEFAULT_SHOES;
  return fighterAssetFile("shoes", base);
}

export function resolveAccessoryAssetUrl(key: unknown): string {
  const k = typeof key === "string" ? (key as GearHeadgearKey) : "none";
  const base = ACCESSORY_BY_GEAR[k] ?? DEFAULT_ACCESSORY;
  return fighterAssetFile("accessories", base);
}
