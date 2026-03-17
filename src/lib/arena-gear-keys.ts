/**
 * Map arena_store_items (category + name) to visual gear keys used by FighterLayers/characterAssets.
 */

export function storeItemToGlovesKey(category: string, name: string): string {
  const c = category?.toLowerCase() ?? "";
  const n = name?.toLowerCase() ?? "";
  if (c.includes("glove")) {
    if (n.includes("pro")) return "pro_gloves";
    if (n.includes("basic") || n.includes("wraps")) return "default";
    if (n.includes("street")) return "street_gloves";
    if (n.includes("titanium")) return "titanium_gloves";
    if (n.includes("champion")) return "championship_gloves";
    return "default";
  }
  return "default";
}

export function storeItemToShoesKey(category: string, name: string): string {
  const c = category?.toLowerCase() ?? "";
  const n = name?.toLowerCase() ?? "";
  if (c.includes("shoe")) {
    if (n.includes("speed") || n.includes("sneaker")) return "speed_boots";
    if (n.includes("elite") || n.includes("boot")) return "ring_boots";
    if (n.includes("power") || n.includes("stomper")) return "power_stompers";
    if (n.includes("legendary") || n.includes("kick")) return "legendary_kicks";
    if (n.includes("bare")) return "bare_feet";
    return "default";
  }
  return "default";
}

export function storeItemToShortsKey(category: string, name: string): string {
  const c = category?.toLowerCase() ?? "";
  const n = name?.toLowerCase() ?? "";
  if (c.includes("short")) {
    if (n.includes("champion")) return "champion_trunks";
    if (n.includes("training")) return "default";
    if (n.includes("street")) return "street_shorts";
    if (n.includes("gold")) return "gold_trunks";
    if (n.includes("diamond")) return "diamond_shorts";
    return "default";
  }
  return "default";
}

export function storeItemToHeadgearKey(category: string, name: string): string {
  const c = category?.toLowerCase() ?? "";
  const n = name?.toLowerCase() ?? "";
  if (c.includes("headgear") || c.includes("helmet")) {
    if (n.includes("titan") || n.includes("iron") || n.includes("skull")) return "iron_skull";
    if (n.includes("pro")) return "pro";
    if (n.includes("basic")) return "basic";
    return "basic";
  }
  return "none";
}
