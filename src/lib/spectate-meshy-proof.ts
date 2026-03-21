/**
 * Spectate Meshy proof mode: one stable GLB URL that always resolves (Three.js sample).
 * Used when fighter API has no `model_3d_url` yet — proves the WebGL + GLTF path on production.
 */
export const SPECTATE_MESHY_PROOF_GLB_URL =
  "https://threejs.org/examples/models/gltf/Duck/glTF-Binary/Duck.glb" as const;
