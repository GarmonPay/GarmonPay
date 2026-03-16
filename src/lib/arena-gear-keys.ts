/**
 * Map arena_store_items (category + name) to FighterDisplay gear visual keys.
 * Used by /api/arena/me to return equipped_gloves_key etc.
 */

import type { GearGlovesKey, GearShoesKey, GearShortsKey, GearHeadgearKey } from "./arena-fighter-types";

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function storeItemToGlovesKey(category: string, name: string): GearGlovesKey {
  const c = norm(category);
  const n = norm(name);
  if (c.includes("glove")) {
    if (n.includes("basic") || n.includes("wrap")) return "wraps";
    if (n.includes("street")) return "street_gloves";
    if (n.includes("pro")) return "pro_gloves";
    if (n.includes("titanium")) return "titanium_gloves";
    if (n.includes("champion")) return "championship_gloves";
  }
  return "default";
}

export function storeItemToShoesKey(category: string, name: string): GearShoesKey {
  const c = norm(category);
  const n = norm(name);
  if (c.includes("shoe") || c.includes("boot")) {
    if (n.includes("bare") || n.includes("feet")) return "bare_feet";
    if (n.includes("speed") || n.includes("sneaker")) return "speed_boots";
    if (n.includes("elite") || n.includes("ring")) return "ring_boots";
    if (n.includes("power") || n.includes("stomper")) return "power_stompers";
    if (n.includes("legendary") || n.includes("kick")) return "legendary_kicks";
  }
  return "default";
}

export function storeItemToShortsKey(category: string, name: string): GearShortsKey {
  const c = norm(category);
  const n = norm(name);
  if (c.includes("short") || c.includes("trunk")) {
    if (n.includes("street")) return "street_shorts";
    if (n.includes("gold")) return "gold_trunks";
    if (n.includes("diamond")) return "diamond_shorts";
    if (n.includes("champion")) return "champion_trunks";
  }
  return "default";
}

export function storeItemToHeadgearKey(category: string, name: string): GearHeadgearKey {
  const c = norm(category);
  const n = norm(name);
  if (!c.includes("headgear") && !c.includes("helmet")) return "none";
  if (n.includes("basic")) return "basic";
  if (n.includes("pro")) return "pro";
  if (n.includes("titan") || n.includes("iron") || n.includes("skull")) return "iron_skull";
  return "basic";
}
