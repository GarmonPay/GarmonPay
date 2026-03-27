"use client";

import { Environment } from "@react-three/drei";
import { ARENA_HDRI_FILE, ARENA_HDRI_PATH } from "@/lib/arena-hdri";

export function ArenaLocalEnvironment({ environmentIntensity = 0.75 }: { environmentIntensity?: number }) {
  return (
    <Environment files={ARENA_HDRI_FILE} path={ARENA_HDRI_PATH} environmentIntensity={environmentIntensity} />
  );
}
