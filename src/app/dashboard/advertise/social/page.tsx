"use client";

import Link from "next/link";

/**
 * Advertiser-facing entry for social-style campaigns.
 * User earning flow lives at /dashboard/earn/social.
 */
export default function AdvertiseSocialPage() {
  return (
    <div
      className="min-h-screen px-4 py-10 max-w-lg mx-auto text-white space-y-6"
      style={{ background: "#0e0118", fontFamily: '"DM Sans", sans-serif' }}
    >
      <h1 className="text-2xl font-bold" style={{ color: "#f5c842" }}>
        Social reach
      </h1>
      <p className="text-violet-200/85 leading-relaxed">
        Reach players through follows, likes, and comments. For full ad campaigns (feed, banners, packages), use the
        main Advertise tools.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          href="/dashboard/advertise"
          className="rounded-xl px-4 py-3 text-center font-semibold text-black"
          style={{ background: "#f5c842" }}
        >
          Advertise dashboard
        </Link>
        <Link
          href="/dashboard/earn/social"
          className="rounded-xl border border-violet-500/40 px-4 py-3 text-center text-violet-100"
        >
          User: earn from Social Tasks →
        </Link>
      </div>
    </div>
  );
}
