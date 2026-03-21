"use client";

/**
 * Minimal 3D placeholder when GLTF/scene is missing or clone/normalize fails.
 * Keeps the canvas valid — never pass undefined to <primitive object={...}>.
 */
export function GltfFallbackMesh({ facingRight = false }: { facingRight?: boolean }) {
  const yRot = facingRight ? Math.PI : 0;
  return (
    <group rotation={[0, yRot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[0.52, 1.65, 0.36]} />
        <meshStandardMaterial color="#3a3a48" metalness={0.48} roughness={0.42} />
      </mesh>
    </group>
  );
}
