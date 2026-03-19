"use client";

import dynamic from "next/dynamic";

/** Never SSR: Three.js / R3F only run in the browser. */
export const ArenaFight3DView = dynamic(
  () => import("./ArenaFight3DView.client"),
  { ssr: false }
);
