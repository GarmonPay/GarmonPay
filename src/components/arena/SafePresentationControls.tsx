"use client";

/* eslint-disable react-hooks/exhaustive-deps -- dependency lists match @react-three/drei PresentationControls */
/**
 * @react-three/drei PresentationControls runs easing on ref.current every frame without
 * guarding null; on some mounts (mobile / Strict Mode) that can run before the group ref attaches.
 */
import * as React from "react";
import { MathUtils, type Group } from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useGesture } from "@use-gesture/react";
import { easing } from "maath";

type Props = {
  enabled?: boolean;
  snap?: boolean | number;
  global?: boolean;
  domElement?: HTMLElement | null;
  cursor?: boolean;
  children?: React.ReactNode;
  speed?: number;
  rotation?: [number, number, number];
  zoom?: number;
  polar?: [number, number];
  azimuth?: [number, number];
  damping?: number;
};

export function SafePresentationControls({
  enabled = true,
  snap,
  global,
  domElement,
  cursor = true,
  children,
  speed = 1,
  rotation = [0, 0, 0],
  zoom = 1,
  polar = [0, Math.PI / 2],
  azimuth = [-Infinity, Infinity],
  damping = 0.25,
}: Props) {
  const events = useThree((state) => state.events);
  const gl = useThree((state) => state.gl);
  const explDomElement = domElement || events.connected || gl.domElement;
  const { size } = useThree();
  const rPolar = React.useMemo(
    () => [rotation[0] + polar[0], rotation[0] + polar[1]] as [number, number],
    [rotation[0], polar[0], polar[1]]
  );
  const rAzimuth = React.useMemo(
    () => [rotation[1] + azimuth[0], rotation[1] + azimuth[1]] as [number, number],
    [rotation[1], azimuth[0], azimuth[1]]
  );
  const rInitial = React.useMemo(
    () =>
      [MathUtils.clamp(rotation[0], ...rPolar), MathUtils.clamp(rotation[1], ...rAzimuth), rotation[2]] as [
        number,
        number,
        number,
      ],
    [rotation[0], rotation[1], rotation[2], rPolar, rAzimuth]
  );

  React.useEffect(() => {
    if (global && cursor && enabled && explDomElement) {
      explDomElement.style.cursor = "grab";
      gl.domElement.style.cursor = "";
      return () => {
        explDomElement.style.cursor = "default";
        gl.domElement.style.cursor = "default";
      };
    }
  }, [global, cursor, explDomElement, enabled, gl.domElement]);

  const [animation] = React.useState({
    scale: 1,
    rotation: rInitial,
    damping,
  });

  const ref = React.useRef<Group>(null);

  useFrame((_, delta) => {
    const node = ref.current;
    if (!node) return;
    easing.damp3(node.scale, animation.scale, animation.damping, delta);
    easing.dampE(node.rotation, animation.rotation, animation.damping, delta);
  });

  const bind = useGesture(
    {
      onHover: ({ last }) => {
        if (cursor && !global && enabled && explDomElement) {
          explDomElement.style.cursor = last ? "auto" : "grab";
        }
      },
      onDrag: ({
        down,
        delta: [x, y],
        memo: [oldY, oldX] = animation.rotation || rInitial,
      }) => {
        if (!enabled || !explDomElement) return [y, x];
        if (cursor) explDomElement.style.cursor = down ? "grabbing" : "grab";
        const nextX = MathUtils.clamp(oldX + (x / size.width) * Math.PI * speed, ...rAzimuth);
        const nextY = MathUtils.clamp(oldY + (y / size.height) * Math.PI * speed, ...rPolar);
        animation.scale = down && nextY > rPolar[1] / 2 ? zoom : 1;
        animation.rotation = snap && !down ? rInitial : [nextY, nextX, 0];
        animation.damping = snap && !down && typeof snap !== "boolean" ? snap : damping;
        return [nextY, nextX];
      },
    },
    { target: global ? explDomElement ?? undefined : undefined }
  );

  return (
    <group ref={ref} {...(bind == null ? undefined : bind())}>
      {children}
    </group>
  );
}
