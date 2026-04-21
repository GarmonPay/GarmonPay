"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const LIVE_BUILD_TEST_BANNER = (
  <div
    style={{
      background: "red",
      color: "white",
      fontSize: "28px",
      textAlign: "center",
      padding: "20px",
      fontWeight: "bold",
      zIndex: 9999,
    }}
  >
    LIVE BUILD TEST — CELO ROOM UPDATED
  </div>
);

export default function CeloGamesRoomRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = typeof params?.roomId === "string" ? params.roomId : "";

  useEffect(() => {
    if (roomId) {
      router.replace(`/dashboard/games/celo/${roomId}`);
    }
  }, [roomId, router]);

  return (
    <div style={{ minHeight: "100vh", background: "#05010F" }}>
      {LIVE_BUILD_TEST_BANNER}
      <p style={{ color: "white", textAlign: "center", padding: 16 }}>
        Redirecting to /dashboard/games/celo/{roomId || "…"}
      </p>
    </div>
  );
}
