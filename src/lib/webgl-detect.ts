/**
 * WebGL detection for graceful fallback to SVG/2D when unsupported (e.g. old devices, no GPU).
 * Never show errors to users — always fallback gracefully.
 */

export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    );
  } catch {
    return false;
  }
}

let cached: boolean | null = null;

/** Cached result for same-session use. */
export function getHasWebGL(): boolean {
  if (cached === null) cached = hasWebGL();
  return cached;
}
