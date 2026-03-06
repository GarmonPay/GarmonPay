"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const REFERRAL_COOKIE = "garmonpay_ref";
const COOKIE_MAX_AGE_DAYS = 14;

function setReferralCookie(code: string) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(code.trim());
  document.cookie = `${REFERRAL_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax`;
}

export default function ReferralLandingPage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params?.code === "string" ? params.code.trim() : "";

  useEffect(() => {
    if (code) {
      setReferralCookie(code);
    }
    router.replace("/register" + (code ? `?ref=${encodeURIComponent(code)}` : ""));
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] text-white">
      <p className="text-[#9ca3af]">Redirecting…</p>
    </div>
  );
}
