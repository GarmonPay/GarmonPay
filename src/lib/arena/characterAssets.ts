/** Safe defaults — never undefined */
export const SAFE_BODY = {
  torsoScale: [0.52, 0.7, 0.28] as [number, number, number],
  shoulderWidth: 0.5,
  armThickness: 0.085,
  legThickness: 0.1,
  height: 1.0,
};

export const SAFE_GLOVE = {
  color: "#cc2222",
  emissive: "#110000",
  scale: [1.1, 0.9, 1.0] as [number, number, number],
  metalness: 0.1,
  roughness: 0.6,
  name: "Default",
};

export const SAFE_SHORTS = {
  color: "#1a1a2e",
  stripeColor: "#ffffff",
  name: "Default",
};

export const SAFE_SHOES = {
  color: "#111111",
  soleColor: "#222222",
  name: "Default",
};

// ─── BODY TYPES ───────────────────────────────
export const BODY_TYPES = {
  lightweight: {
    torsoScale: [0.45, 0.65, 0.25] as [number, number, number],
    shoulderWidth: 0.42,
    armThickness: 0.07,
    legThickness: 0.09,
    height: 1.0,
  },
  middleweight: {
    torsoScale: [0.52, 0.7, 0.28] as [number, number, number],
    shoulderWidth: 0.5,
    armThickness: 0.085,
    legThickness: 0.1,
    height: 1.0,
  },
  heavyweight: {
    torsoScale: [0.62, 0.72, 0.32] as [number, number, number],
    shoulderWidth: 0.6,
    armThickness: 0.1,
    legThickness: 0.12,
    height: 1.0,
  },
};

// ─── SKIN TONES ───────────────────────────────
export const SKIN_TONES = {
  tone1: "#f5d5b8",
  tone2: "#e8b89a",
  tone3: "#d4956a",
  tone4: "#b8723d",
  tone5: "#8d4a1f",
  tone6: "#5c2e0e",
};

// ─── GLOVES ───────────────────────────────────
export const GLOVE_STYLES = {
  default: {
    color: "#ffffff",
    emissive: "#000000",
    scale: [1.0, 0.85, 0.9] as [number, number, number],
    metalness: 0.0,
    roughness: 0.8,
    name: "Basic Wraps",
  },
  wraps: {
    color: "#ffffff",
    emissive: "#000000",
    scale: [1.0, 0.85, 0.9] as [number, number, number],
    metalness: 0.0,
    roughness: 0.8,
    name: "Basic Wraps",
  },
  street_gloves: {
    color: "#cc2222",
    emissive: "#110000",
    scale: [1.1, 0.9, 1.0] as [number, number, number],
    metalness: 0.1,
    roughness: 0.6,
    name: "Street Gloves",
  },
  pro_gloves: {
    color: "#1a3a8f",
    emissive: "#000511",
    scale: [1.2, 0.92, 1.05] as [number, number, number],
    metalness: 0.15,
    roughness: 0.5,
    name: "Pro Fight Gloves",
  },
  titanium_gloves: {
    color: "#9aa0a8",
    emissive: "#050508",
    scale: [1.25, 0.95, 1.1] as [number, number, number],
    metalness: 0.7,
    roughness: 0.2,
    name: "Titanium Gloves",
    shimmer: true,
  },
  championship_gloves: {
    color: "#f0c040",
    emissive: "#201000",
    scale: [1.3, 1.0, 1.15] as [number, number, number],
    metalness: 0.6,
    roughness: 0.2,
    name: "Championship Gloves",
    glow: true,
    glowColor: "#f0a500",
  },
};

// ─── SHORTS ───────────────────────────────────
export const SHORTS_STYLES = {
  default: {
    color: "#1a1a2e",
    stripeColor: "#ffffff",
    name: "Default Trunks",
  },
  street_shorts: {
    color: "#cc2222",
    stripeColor: "#ffffff",
    name: "Street Shorts",
  },
  gold_trunks: {
    color: "#c8960c",
    stripeColor: "#ffe44d",
    name: "Gold Trunks",
    shimmer: true,
  },
  diamond_shorts: {
    color: "#0a0a0a",
    stripeColor: "#88ccff",
    name: "Diamond Shorts",
    sparkle: true,
  },
  champion_trunks: {
    color: "#f5f5f5",
    stripeColor: "#f0a500",
    name: "Champion Trunks",
    fire: true,
  },
};

// ─── SHOES ────────────────────────────────────
export const SHOE_STYLES = {
  default: {
    color: "#111111",
    soleColor: "#222222",
    name: "Default Shoes",
  },
  bare_feet: {
    color: "#111111",
    soleColor: "#222222",
    name: "Bare Feet",
  },
  ring_boots: {
    color: "#0a0a0a",
    soleColor: "#333333",
    height: 0.35,
    name: "Ring Boots",
  },
  speed_boots: {
    color: "#f5f5f5",
    soleColor: "#f0a500",
    height: 0.32,
    name: "Speed Boots",
    stripe: true,
    stripeColor: "#f0a500",
  },
  power_stompers: {
    color: "#111111",
    soleColor: "#cc2222",
    height: 0.38,
    name: "Power Stompers",
    heavy: true,
  },
  legendary_kicks: {
    color: "#c8960c",
    soleColor: "#f0c040",
    height: 0.34,
    name: "Legendary Kicks",
    lightning: true,
  },
};

// ─── HEADGEAR ─────────────────────────────────
export const HEADGEAR_STYLES = {
  none: null,
  basic: {
    color: "#111111",
    coverage: "partial",
    name: "Basic Headgear",
  },
  pro: {
    color: "#cc2222",
    coverage: "full",
    name: "Pro Headgear",
  },
  iron: {
    color: "#888888",
    coverage: "full",
    metallic: true,
    name: "Iron Skull Cap",
  },
};

// ─── FIGHTER POSES ────────────────────────────
export const FIGHTER_POSES = {
  orthodox_guard: {
    leftUpperArm: { x: -0.4, y: -0.1, z: -0.5 },
    leftForearm: { x: -0.1, y: 0.0, z: -0.8 },
    leftGlove: { x: -0.15, y: 1.45, z: -0.6 },
    rightUpperArm: { x: 0.3, y: -0.2, z: -0.2 },
    rightForearm: { x: 0.2, y: 0.1, z: -0.3 },
    rightGlove: { x: 0.22, y: 1.35, z: 0.1 },
    bodyRotationY: -0.4,
    leftFoot: { x: -0.18, y: 0, z: -0.2 },
    rightFoot: { x: 0.18, y: 0, z: 0.15 },
    kneeBend: 0.1,
  },
  victory: {
    leftUpperArm: { x: -0.8, y: 0.6, z: 0 },
    leftForearm: { x: -0.7, y: 0.8, z: 0 },
    leftGlove: { x: -0.5, y: 2.2, z: 0 },
    rightUpperArm: { x: 0.8, y: 0.6, z: 0 },
    rightForearm: { x: 0.7, y: 0.8, z: 0 },
    rightGlove: { x: 0.5, y: 2.2, z: 0 },
    bodyRotationY: 0,
    leftFoot: { x: -0.22, y: 0, z: 0 },
    rightFoot: { x: 0.22, y: 0, z: 0 },
    kneeBend: 0,
  },
  defeat: {
    leftUpperArm: { x: -0.2, y: -0.4, z: 0.1 },
    leftForearm: { x: -0.15, y: -0.3, z: 0.1 },
    leftGlove: { x: -0.2, y: 0.6, z: 0.1 },
    rightUpperArm: { x: 0.2, y: -0.4, z: 0.1 },
    rightForearm: { x: 0.15, y: -0.3, z: 0.1 },
    rightGlove: { x: 0.2, y: 0.6, z: 0.1 },
    bodyRotationY: 0,
    leftFoot: { x: -0.22, y: 0, z: 0 },
    rightFoot: { x: 0.22, y: 0, z: 0 },
    kneeBend: 0.05,
  },
};

// ─── ANIMATIONS ───────────────────────────────
export const ANIMATIONS = {
  idle: {
    breathing: { speed: 0.8, amplitude: 0.012 },
    weightShift: { speed: 0.4, amplitude: 0.02 },
    headBob: { speed: 0.6, amplitude: 0.008 },
    gloveCircle: { speed: 0.3, amplitude: 0.015 },
  },
  training_heavy_bag: {
    duration: 1500,
    frames: [
      { t: 0, leftGloveZ: -0.6, rightGloveZ: 0.1 },
      { t: 0.3, leftGloveZ: -1.1, rightGloveZ: 0.1 },
      { t: 0.6, leftGloveZ: -0.6, rightGloveZ: 0.1 },
      { t: 0.8, leftGloveZ: -0.6, rightGloveZ: -0.5 },
      { t: 1.0, leftGloveZ: -0.6, rightGloveZ: 0.1 },
    ],
  },
  jab: {
    duration: 300,
    frames: [
      { t: 0, leftGloveZ: -0.6 },
      { t: 0.4, leftGloveZ: -1.2 },
      { t: 1.0, leftGloveZ: -0.6 },
    ],
  },
  right_hand: {
    duration: 400,
    frames: [
      { t: 0, rightGloveZ: 0.1, bodyRotY: -0.4 },
      { t: 0.4, rightGloveZ: -1.1, bodyRotY: -0.8 },
      { t: 1.0, rightGloveZ: 0.1, bodyRotY: -0.4 },
    ],
  },
};

// ─── SIGNATURE MOVE EFFECTS ───────────────────
export const SIGNATURE_EFFECTS = {
  THE_HAYMAKER: {
    glowColor: "#ff4400",
    particleColor: "#ff6600",
    screenFlash: "#ff2200",
    duration: 600,
  },
  COUNTER_HOOK: {
    glowColor: "#0044ff",
    particleColor: "#0066ff",
    screenFlash: "#0022ff",
    duration: 400,
  },
  FLASH_KO: {
    glowColor: "#ffff00",
    particleColor: "#ffee00",
    screenFlash: "#ffffff",
    duration: 300,
  },
  THE_FINAL_ROUND: {
    glowColor: "#f0a500",
    particleColor: "#f0c040",
    screenFlash: "#f0a500",
    duration: 800,
  },
};

// ─── RING CONFIGURATIONS ──────────────────────
export const RING_CONFIG = {
  canvasSize: 10,
  canvasColor: "#1a1008",
  apronColor: "#080d14",
  postColor: "#b8b8b8",
  postMetalness: 0.9,
  ropeColors: ["#c1272d", "#f0a500", "#c1272d", "#f0a500"],
  ropeHeights: [0.8, 1.4, 2.0, 2.6],
  ropeRadius: 0.028,
  goldCorners: [0, 2],
  redCorners: [1, 3],
  cornerPadColor: { gold: "#f0a500", red: "#c1272d" },
  spotlight: {
    position: [0, 12, 0] as [number, number, number],
    intensity: 4,
    angle: 0.35,
    penumbra: 0.4,
    color: "#fff5e0",
  },
  ambientIntensity: 0.03,
  fogColor: "#000000",
  fogDensity: 0.06,
  crowdCount: 200,
  crowdColor: "#1a1a1a",
};

function normKey(v: unknown, fallback: string): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s.length > 0 ? s : fallback;
}

/** Single safe config API — never throws from bad keys (UUIDs, null, etc.) */
export function getSafeFighterConfig(fighter?: unknown) {
  try {
    const f = fighter && typeof fighter === "object" ? (fighter as Record<string, unknown>) : {};
    const bodyKey = normKey(f.body_type, "middleweight");
    const skinKey = normKey(f.skin_tone, "tone3");
    const gloveKey = normKey(f.equipped_gloves, "default");
    const shortsKey = normKey(f.equipped_shorts, "default");
    const shoesKey = normKey(f.equipped_shoes, "default");
    const headgearKey = normKey(f.equipped_headgear, "none");

    const bodyType =
      BODY_TYPES && typeof BODY_TYPES === "object" && bodyKey in BODY_TYPES
        ? BODY_TYPES[bodyKey as keyof typeof BODY_TYPES]
        : SAFE_BODY;
    const skinColor =
      SKIN_TONES && typeof SKIN_TONES === "object" && skinKey in SKIN_TONES
        ? SKIN_TONES[skinKey as keyof typeof SKIN_TONES]
        : "#d4956a";
    const gloves =
      GLOVE_STYLES && typeof GLOVE_STYLES === "object" && gloveKey in GLOVE_STYLES
        ? GLOVE_STYLES[gloveKey as keyof typeof GLOVE_STYLES]
        : SAFE_GLOVE;
    const shorts =
      SHORTS_STYLES && typeof SHORTS_STYLES === "object" && shortsKey in SHORTS_STYLES
        ? SHORTS_STYLES[shortsKey as keyof typeof SHORTS_STYLES]
        : SAFE_SHORTS;
    const shoes =
      SHOE_STYLES && typeof SHOE_STYLES === "object" && shoesKey in SHOE_STYLES
        ? SHOE_STYLES[shoesKey as keyof typeof SHOE_STYLES]
        : SAFE_SHOES;

    let headgear: (typeof HEADGEAR_STYLES)["basic"] | null = null;
    if (headgearKey && headgearKey !== "none" && HEADGEAR_STYLES && headgearKey in HEADGEAR_STYLES) {
      const hg = HEADGEAR_STYLES[headgearKey as keyof typeof HEADGEAR_STYLES];
      headgear = hg && typeof hg === "object" ? hg : null;
    }

    const color =
      typeof f.fighter_color === "string" && f.fighter_color.trim() ? f.fighter_color.trim() : "#f0a500";

    const validBody =
      bodyKey === "lightweight" || bodyKey === "middleweight" || bodyKey === "heavyweight"
        ? bodyKey
        : "middleweight";
    const validSkin = skinKey in SKIN_TONES ? skinKey : "tone3";
    const validGlove = gloveKey in GLOVE_STYLES ? gloveKey : "default";
    const validShorts = shortsKey in SHORTS_STYLES ? shortsKey : "default";
    const validShoes = shoesKey in SHOE_STYLES ? shoesKey : "default";
    let validHeadgearStr = "none";
    if (headgearKey !== "none" && headgearKey in HEADGEAR_STYLES) {
      const hg = HEADGEAR_STYLES[headgearKey as keyof typeof HEADGEAR_STYLES];
      if (hg != null) validHeadgearStr = headgearKey;
    }

    return {
      bodyType,
      bodyTypeKey: validBody,
      skinToneKey: validSkin,
      gloveKey: validGlove,
      shortsKey: validShorts,
      shoesKey: validShoes,
      headgearKey: validHeadgearStr,
      skinColor,
      gloves,
      shorts,
      shoes,
      headgear,
      pose: FIGHTER_POSES.orthodox_guard,
      color,
    };
  } catch (error) {
    console.error("getSafeFighterConfig error:", error);
    return {
      bodyType: SAFE_BODY,
      bodyTypeKey: "middleweight" as const,
      skinToneKey: "tone3",
      gloveKey: "default",
      shortsKey: "default",
      shoesKey: "default",
      headgearKey: "none",
      skinColor: "#d4956a",
      gloves: SAFE_GLOVE,
      shorts: SAFE_SHORTS,
      shoes: SAFE_SHOES,
      headgear: null,
      pose: FIGHTER_POSES.orthodox_guard,
      color: "#f0a500",
    };
  }
}
