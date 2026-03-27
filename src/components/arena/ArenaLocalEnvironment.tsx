"use client";

import { Environment, useEnvironment } from "@react-three/drei";

/** Matches drei's `preset="studio"` asset; hosted under `public/hdri/` (no external CDN). */
export const ARENA_HDRI_FILE = "studio_small_03_1k.hdr";
export const ARENA_HDRI_PATH = "/hdri/";

let arenaHdriPreloadRequested = false;

/** Warm RGBELoader cache before the first Canvas mounts (idempotent). */
export function preloadArenaHdri() {
  if (typeof window === "undefined" || arenaHdriPreloadRequested) return;
  arenaHdriPreloadRequested = true;
  useEnvironment.preload({ files: ARENA_HDRI_FILE, path: ARENA_HDRI_PATH });
}

export function ArenaLocalEnvironment({ environmentIntensity = 0.75 }: { environmentIntensity?: number }) {
  return (
    <Environment files={ARENA_HDRI_FILE} path={ARENA_HDRI_PATH} environmentIntensity={environmentIntensity} />
  );
}
