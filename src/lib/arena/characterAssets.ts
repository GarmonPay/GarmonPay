import * as THREE from 'three'

// ─── BODY TYPES ───────────────────────────────
export const BODY_TYPES = {
  lightweight: {
    torsoScale: [0.45, 0.65, 0.25],
    shoulderWidth: 0.42,
    armThickness: 0.07,
    legThickness: 0.09,
    height: 1.0
  },
  middleweight: {
    torsoScale: [0.52, 0.70, 0.28],
    shoulderWidth: 0.50,
    armThickness: 0.085,
    legThickness: 0.10,
    height: 1.0
  },
  heavyweight: {
    torsoScale: [0.62, 0.72, 0.32],
    shoulderWidth: 0.60,
    armThickness: 0.10,
    legThickness: 0.12,
    height: 1.0
  }
}

// ─── SKIN TONES ───────────────────────────────
export const SKIN_TONES = {
  tone1: '#f5d5b8',
  tone2: '#e8b89a',
  tone3: '#d4956a',
  tone4: '#b8723d',
  tone5: '#8d4a1f',
  tone6: '#5c2e0e'
}

// ─── GLOVES ───────────────────────────────────
// Keys match GearGlovesKey in arena-fighter-types.ts and values returned by storeItemToGlovesKey()
export const GLOVE_STYLES = {
  default: {
    color: '#ffffff',
    emissive: '#000000',
    scale: [1.0, 0.85, 0.9],
    metalness: 0.0,
    roughness: 0.8,
    name: 'Basic Wraps'
  },
  wraps: {
    color: '#ffffff',
    emissive: '#000000',
    scale: [1.0, 0.85, 0.9],
    metalness: 0.0,
    roughness: 0.8,
    name: 'Basic Wraps'
  },
  street_gloves: {
    color: '#cc2222',
    emissive: '#110000',
    scale: [1.1, 0.9, 1.0],
    metalness: 0.1,
    roughness: 0.6,
    name: 'Street Gloves'
  },
  pro_gloves: {
    color: '#1a3a8f',
    emissive: '#000511',
    scale: [1.2, 0.92, 1.05],
    metalness: 0.15,
    roughness: 0.5,
    name: 'Pro Fight Gloves'
  },
  titanium_gloves: {
    color: '#9aa0a8',
    emissive: '#050508',
    scale: [1.25, 0.95, 1.1],
    metalness: 0.7,
    roughness: 0.2,
    name: 'Titanium Gloves',
    shimmer: true
  },
  championship_gloves: {
    color: '#f0c040',
    emissive: '#201000',
    scale: [1.3, 1.0, 1.15],
    metalness: 0.6,
    roughness: 0.2,
    name: 'Championship Gloves',
    glow: true,
    glowColor: '#f0a500'
  }
}

// ─── SHORTS ───────────────────────────────────
// Keys match GearShortsKey in arena-fighter-types.ts and values returned by storeItemToShortsKey()
export const SHORTS_STYLES = {
  default: {
    color: '#1a1a2e',
    stripeColor: '#ffffff',
    name: 'Default Trunks'
  },
  street_shorts: {
    color: '#cc2222',
    stripeColor: '#ffffff',
    name: 'Street Shorts'
  },
  gold_trunks: {
    color: '#c8960c',
    stripeColor: '#ffe44d',
    name: 'Gold Trunks',
    shimmer: true
  },
  diamond_shorts: {
    color: '#0a0a0a',
    stripeColor: '#88ccff',
    name: 'Diamond Shorts',
    sparkle: true
  },
  champion_trunks: {
    color: '#f5f5f5',
    stripeColor: '#f0a500',
    name: 'Champion Trunks',
    fire: true
  }
}

// ─── SHOES ────────────────────────────────────
// Keys match GearShoesKey in arena-fighter-types.ts and values returned by storeItemToShoesKey()
export const SHOE_STYLES = {
  default: {
    color: '#111111',
    soleColor: '#222222',
    name: 'Default Shoes'
  },
  bare_feet: {
    color: '#111111',
    soleColor: '#222222',
    name: 'Bare Feet'
  },
  ring_boots: {
    color: '#0a0a0a',
    soleColor: '#333333',
    height: 0.35,
    name: 'Ring Boots'
  },
  speed_boots: {
    color: '#f5f5f5',
    soleColor: '#f0a500',
    height: 0.32,
    name: 'Speed Boots',
    stripe: true,
    stripeColor: '#f0a500'
  },
  power_stompers: {
    color: '#111111',
    soleColor: '#cc2222',
    height: 0.38,
    name: 'Power Stompers',
    heavy: true
  },
  legendary_kicks: {
    color: '#c8960c',
    soleColor: '#f0c040',
    height: 0.34,
    name: 'Legendary Kicks',
    lightning: true
  }
}

// ─── HEADGEAR ─────────────────────────────────
export const HEADGEAR_STYLES = {
  none: null,
  basic: {
    color: '#111111',
    coverage: 'partial',
    name: 'Basic Headgear'
  },
  pro: {
    color: '#cc2222',
    coverage: 'full',
    name: 'Pro Headgear'
  },
  iron: {
    color: '#888888',
    coverage: 'full',
    metallic: true,
    name: 'Iron Skull Cap'
  }
}

// ─── FIGHTER POSES ────────────────────────────
export const FIGHTER_POSES = {
  orthodox_guard: {
    // Left arm - jab arm extended forward
    leftUpperArm: { x: -0.4, y: -0.1, z: -0.5 },
    leftForearm:  { x: -0.1, y: 0.0,  z: -0.8 },
    leftGlove:    { x: -0.15, y: 1.45, z: -0.6 },
    // Right arm - power arm tucked
    rightUpperArm: { x: 0.3, y: -0.2, z: -0.2 },
    rightForearm:  { x: 0.2, y: 0.1,  z: -0.3 },
    rightGlove:    { x: 0.22, y: 1.35, z: 0.1 },
    // Body rotation
    bodyRotationY: -0.4,
    // Leg positions
    leftFoot:  { x: -0.18, y: 0, z: -0.2 },
    rightFoot: { x: 0.18,  y: 0, z: 0.15 },
    // Knee bend
    kneeBend: 0.1
  },
  victory: {
    leftUpperArm:  { x: -0.8, y: 0.6, z: 0 },
    leftForearm:   { x: -0.7, y: 0.8, z: 0 },
    leftGlove:     { x: -0.5, y: 2.2, z: 0 },
    rightUpperArm: { x: 0.8,  y: 0.6, z: 0 },
    rightForearm:  { x: 0.7,  y: 0.8, z: 0 },
    rightGlove:    { x: 0.5,  y: 2.2, z: 0 },
    bodyRotationY: 0,
    leftFoot:  { x: -0.22, y: 0, z: 0 },
    rightFoot: { x: 0.22,  y: 0, z: 0 },
    kneeBend: 0
  },
  defeat: {
    leftUpperArm:  { x: -0.2, y: -0.4, z: 0.1 },
    leftForearm:   { x: -0.15, y: -0.3, z: 0.1 },
    leftGlove:     { x: -0.2, y: 0.6, z: 0.1 },
    rightUpperArm: { x: 0.2,  y: -0.4, z: 0.1 },
    rightForearm:  { x: 0.15, y: -0.3, z: 0.1 },
    rightGlove:    { x: 0.2,  y: 0.6, z: 0.1 },
    bodyRotationY: 0,
    leftFoot:  { x: -0.22, y: 0, z: 0 },
    rightFoot: { x: 0.22,  y: 0, z: 0 },
    kneeBend: 0.05
  }
}

// ─── ANIMATIONS ───────────────────────────────
export const ANIMATIONS = {
  idle: {
    breathing: { speed: 0.8, amplitude: 0.012 },
    weightShift: { speed: 0.4, amplitude: 0.02 },
    headBob: { speed: 0.6, amplitude: 0.008 },
    gloveCircle: { speed: 0.3, amplitude: 0.015 }
  },
  training_heavy_bag: {
    duration: 1500,
    frames: [
      { t: 0,   leftGloveZ: -0.6, rightGloveZ: 0.1 },
      { t: 0.3, leftGloveZ: -1.1, rightGloveZ: 0.1 },
      { t: 0.6, leftGloveZ: -0.6, rightGloveZ: 0.1 },
      { t: 0.8, leftGloveZ: -0.6, rightGloveZ: -0.5 },
      { t: 1.0, leftGloveZ: -0.6, rightGloveZ: 0.1 },
    ]
  },
  jab: {
    duration: 300,
    frames: [
      { t: 0,   leftGloveZ: -0.6 },
      { t: 0.4, leftGloveZ: -1.2 },
      { t: 1.0, leftGloveZ: -0.6 },
    ]
  },
  right_hand: {
    duration: 400,
    frames: [
      { t: 0,   rightGloveZ: 0.1,  bodyRotY: -0.4 },
      { t: 0.4, rightGloveZ: -1.1, bodyRotY: -0.8 },
      { t: 1.0, rightGloveZ: 0.1,  bodyRotY: -0.4 },
    ]
  }
}

// ─── SIGNATURE MOVE EFFECTS ───────────────────
export const SIGNATURE_EFFECTS = {
  THE_HAYMAKER: {
    glowColor: '#ff4400',
    particleColor: '#ff6600',
    screenFlash: '#ff2200',
    duration: 600
  },
  COUNTER_HOOK: {
    glowColor: '#0044ff',
    particleColor: '#0066ff',
    screenFlash: '#0022ff',
    duration: 400
  },
  FLASH_KO: {
    glowColor: '#ffff00',
    particleColor: '#ffee00',
    screenFlash: '#ffffff',
    duration: 300
  },
  THE_FINAL_ROUND: {
    glowColor: '#f0a500',
    particleColor: '#f0c040',
    screenFlash: '#f0a500',
    duration: 800
  }
}

// ─── RING CONFIGURATIONS ──────────────────────
export const RING_CONFIG = {
  canvasSize: 10,
  canvasColor: '#1a1008',
  apronColor: '#080d14',
  postColor: '#b8b8b8',
  postMetalness: 0.9,
  ropeColors: ['#c1272d', '#f0a500', '#c1272d', '#f0a500'],
  ropeHeights: [0.8, 1.4, 2.0, 2.6],
  ropeRadius: 0.028,
  goldCorners: [0, 2],
  redCorners: [1, 3],
  cornerPadColor: { gold: '#f0a500', red: '#c1272d' },
  spotlight: {
    position: [0, 12, 0] as [number,number,number],
    intensity: 4,
    angle: 0.35,
    penumbra: 0.4,
    color: '#fff5e0'
  },
  ambientIntensity: 0.03,
  fogColor: '#000000',
  fogDensity: 0.06,
  crowdCount: 200,
  crowdColor: '#1a1a1a'
}

// ─── GET FIGHTER CONFIG ───────────────────────
export function getFighterConfig(fighter: any) {
  // Guard: if fighter is null/undefined return all defaults
  if (!fighter) {
    return {
      bodyType: BODY_TYPES.middleweight,
      skinColor: SKIN_TONES.tone3,
      gloves: GLOVE_STYLES.default,
      shorts: SHORTS_STYLES.default,
      shoes: SHOE_STYLES.default,
      headgear: null,
      pose: FIGHTER_POSES.orthodox_guard,
      color: '#f0a500'
    }
  }
  // equipped_gloves / equipped_shorts / equipped_shoes may be a UUID (from old inventory
  // system) or a gear key string. Use optional chaining — DB columns can be null for existing fighters.
  const bodyTypeKey   = (typeof fighter?.body_type       === 'string' ? fighter.body_type.trim()       : '') as keyof typeof BODY_TYPES
  const skinToneKey   = (typeof fighter?.skin_tone      === 'string' ? fighter.skin_tone.trim()       : '') as keyof typeof SKIN_TONES
  const glovesKey     = (typeof fighter?.equipped_gloves  === 'string' ? fighter.equipped_gloves.trim()  : '') as keyof typeof GLOVE_STYLES
  const shortsKey     = (typeof fighter?.equipped_shorts  === 'string' ? fighter.equipped_shorts.trim()  : '') as keyof typeof SHORTS_STYLES
  const shoesKey      = (typeof fighter?.equipped_shoes   === 'string' ? fighter.equipped_shoes.trim()   : '') as keyof typeof SHOE_STYLES
  const headgearKey   = (typeof fighter?.equipped_headgear === 'string' ? fighter.equipped_headgear.trim() : '') as keyof typeof HEADGEAR_STYLES

  return {
    bodyType:  (BODY_TYPES[bodyTypeKey] ?? BODY_TYPES.middleweight),
    skinColor: (SKIN_TONES[skinToneKey] ?? SKIN_TONES.tone3),
    gloves:    (GLOVE_STYLES[glovesKey] ?? GLOVE_STYLES.default),
    shorts:    (SHORTS_STYLES[shortsKey] ?? SHORTS_STYLES.default),
    shoes:     (SHOE_STYLES[shoesKey] ?? SHOE_STYLES.default),
    headgear:  (headgearKey && headgearKey !== 'none')
                 ? (HEADGEAR_STYLES[headgearKey] ?? null)
                 : null,
    pose:  FIGHTER_POSES.orthodox_guard,
    color: (fighter?.fighter_color && typeof fighter.fighter_color === 'string') ? fighter.fighter_color : '#f0a500'
  }
}
