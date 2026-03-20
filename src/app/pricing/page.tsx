"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

const PLANS = [
  {
    name: "Starter",
    price: 19,
    blurb: "Core wallet features and community access.",
    features: ["Basic profile", "Standard support", "Earn & games access"],
  },
  {
    name: "Pro",
    price: 49,
    blurb: "Higher limits and priority support.",
    features: ["Priority support", "Enhanced limits", "Referral tools"],
    highlight: true,
  },
  {
    name: "VIP",
    price: 99,
    blurb: "Maximum platform benefits.",
    features: ["Top-tier support", "Best rates where applicable", "Early features"],
  },
];

export default function PricingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1727] to-[#020617] px-4 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <Link href="/" className="text-sm text-blue-400 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold">Membership</h1>
          <p className="mt-2 text-fintech-muted">Choose a plan that fits how you use GarmonPay.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 ${
                p.highlight
                  ? "border-fintech-accent bg-fintech-accent/10 shadow-lg shadow-fintech-accent/20"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {p.highlight && (
                <span className="mb-2 inline-block rounded-full bg-fintech-accent/30 px-2 py-0.5 text-xs font-semibold text-fintech-accent">
                  Popular
                </span>
              )}
              <h2 className="text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-fintech-muted">{p.blurb}</p>
              <p className="mt-4 text-3xl font-black">
                ${p.price}
                <span className="text-base font-normal text-fintech-muted">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-fintech-muted">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <Link
                href="/register"
                className="mt-6 block w-full rounded-xl bg-fintech-accent py-3 text-center text-sm font-semibold text-white hover:opacity-90"
              >
                Get started
              </Link>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <p style={{ color: "#666", marginBottom: 12 }}>
            Not sure which plan is right for you?
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/earn/calculator")}
            style={{
              padding: "14px 32px",
              background: "transparent",
              color: "#f0a500",
              border: "2px solid #f0a500",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            💰 Calculate Your Earnings First
          </button>
        </div>
      </div>
    </main>
  );
}
