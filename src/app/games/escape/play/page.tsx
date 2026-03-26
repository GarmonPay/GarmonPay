"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

const StakeEscapeExperience = dynamic(
  () => import("@/components/games/StakeEscapeExperience"),
  { ssr: false }
);

function EscapePlayInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s?.accessToken) {
        router.replace(`/login?redirect=${encodeURIComponent("/games/escape")}`);
        return;
      }
      setToken(s.accessToken);
    });
  }, [router]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#0c0618] text-white flex flex-col items-center justify-center px-4">
        <p className="text-violet-200">Missing session.</p>
        <Link href="/games/escape" className="mt-4 text-[#eab308] underline">
          Lobby
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0c0618] text-violet-300 flex items-center justify-center">
        Loading…
      </div>
    );
  }

  return <StakeEscapeExperience sessionId={sessionId} accessToken={token} />;
}

export default function EscapePlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0c0618] text-violet-300 flex items-center justify-center">
          Loading…
        </div>
      }
    >
      <EscapePlayInner />
    </Suspense>
  );
}
