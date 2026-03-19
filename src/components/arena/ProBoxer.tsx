"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const BoxerCanvas = dynamic(() => import("./BoxerCanvas"), { ssr: false });

export default function ProBoxer({
  facingRight = false,
  fighterColor = "#f0a500",
  size = "medium",
  fighter: _fighter,
}: {
  facingRight?: boolean;
  fighterColor?: string;
  size?: "small" | "medium" | "large";
  fighter?: unknown;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const heights = { small: 220, medium: 380, large: 560 };

  if (!mounted) {
    return (
      <div
        style={{
          width: "100%",
          height: heights[size],
          background: "#000",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 48 }}>🥊</span>
      </div>
    );
  }

  return (
    <BoxerCanvas
      facingRight={facingRight}
      fighterColor={fighterColor}
      size={size}
    />
  );
}
