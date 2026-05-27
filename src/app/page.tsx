"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Clock, DollarSign, XCircle } from "lucide-react";

type WaitlistType = "creator" | "earner" | "general";
type FormStatus = "idle" | "loading" | "success" | "error";

function WaitlistForm({
  type,
  source,
  buttonLabel = "Get Early Access",
  className = "",
}: {
  type: WaitlistType;
  source?: string;
  buttonLabel?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) {
        setStatus("error");
        setErrorMessage("Enter your email address.");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      try {
        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, type, source }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
        };

        if (res.ok || res.status === 409) {
          setStatus("success");
          setEmail("");
          return;
        }

        setStatus("error");
        setErrorMessage(
          typeof data.message === "string"
            ? data.message
            : "Something went wrong. Please try again."
        );
      } catch {
        setStatus("error");
        setErrorMessage("Network error. Please try again.");
      }
    },
    [email, type, source]
  );

  if (status === "success") {
    return (
      <p
        className={`rounded-xl border border-[var(--gp-gold)]/40 bg-[var(--gp-gold)]/10 px-4 py-3 text-sm text-[#fde047] ${className}`}
        role="status"
      >
        You are on the waitlist. We will email you before launch.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={`space-y-3 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          disabled={status === "loading"}
          className="min-h-touch flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-violet-300/50 focus:border-[var(--gp-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gp-gold)]/50 disabled:opacity-60"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="min-h-touch shrink-0 rounded-xl bg-gradient-to-r from-[var(--gp-gold)] to-[#fde047] px-6 py-3 text-sm font-semibold text-[#0c0618] transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : buttonLabel}
        </button>
      </div>
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}

function BenefitList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm text-violet-100/90">
          <Check
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gp-gold)]"
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CaptureHomePage() {
  const creatorRef = useRef<HTMLElement>(null);
  const earnerRef = useRef<HTMLElement>(null);

  const scrollTo = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#05020a] text-white">
      {/* Section 1 — Hero */}
      <section className="relative px-4 pb-16 pt-24 tablet:pt-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -left-20 top-16 h-72 w-72 rounded-full bg-violet-600/30 blur-[100px]" />
          <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-[var(--gp-gold)]/15 blur-[100px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-6xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-violet-300/90">
            GarmonPay
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-[#fde047] via-[var(--gp-gold)] to-[#d97706] bg-clip-text text-transparent">
              Real People. Real Views. Real Growth.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-violet-200/90 sm:text-lg">
            The creator discovery network where real humans watch your content —
            and get paid for it.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => scrollTo(creatorRef)}
              className="min-h-touch rounded-xl bg-gradient-to-r from-[var(--gp-gold)] to-[#fde047] px-8 py-4 text-base font-semibold text-[#0c0618] shadow-lg shadow-[var(--gp-gold)]/20 transition hover:brightness-110"
            >
              I&apos;m a Creator
            </button>
            <button
              type="button"
              onClick={() => scrollTo(earnerRef)}
              className="min-h-touch rounded-xl border border-white/15 bg-[#12081f] px-8 py-4 text-base font-semibold text-white transition hover:border-violet-500/40 hover:bg-[#1a0f2e]"
            >
              I&apos;m an Earner
            </button>
          </div>
        </div>
      </section>

      {/* Section 2 — The Problem */}
      <section className="border-y border-white/[0.06] bg-[#0a0514]/90 py-12">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3">
          {[
            {
              icon: XCircle,
              title: "Bot likes don't work",
              body: "Algorithms ignore fake engagement — bots never move the needle.",
            },
            {
              icon: DollarSign,
              title: "Ads are expensive",
              body: "$5–$20 CPM with no targeting precision on who actually watches.",
            },
            {
              icon: Clock,
              title: "Organic is slow",
              body: "Months to build the watch time the algorithm needs to push you.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="text-center md:text-left">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 md:mx-0">
                <Icon className="h-6 w-6 text-[var(--gp-gold)]" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-violet-200/80">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — Creator Capture */}
      <section
        id="creator-capture"
        ref={creatorRef}
        className="scroll-mt-24 px-4 py-16 tablet:py-20"
      >
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-start">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              For Creators
            </h2>
            <p className="mt-4 text-violet-200/85">
              Get your video in front of 1,000+ real humans in your target demo.
              Real watch time triggers the algorithm. Organic growth follows.
            </p>
            <BenefitList
              items={[
                "Real human viewers, never bots",
                "Demo-targeted (age, gender, interests)",
                "Watch-time verified delivery",
                "Pricing from $9 — Starter Boost (500 views)",
              ]}
            />
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 shadow-[0_0_40px_-12px_rgba(139,92,246,0.25)] md:p-8">
            <p className="mb-4 text-sm font-medium text-violet-200">
              Get early access
            </p>
            <WaitlistForm type="creator" source="homepage-creator" />
          </div>
        </div>
      </section>

      {/* Section 4 — Earner Capture */}
      <section
        id="earner-capture"
        ref={earnerRef}
        className="scroll-mt-24 border-t border-white/[0.06] bg-[#080512]/80 px-4 py-16 tablet:py-20"
      >
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-start">
          <div className="md:order-2">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              For Earners
            </h2>
            <p className="mt-4 text-violet-200/85">
              Get paid to discover new creators. Watch videos, rate them, earn
              GPC. Cash out in $GPAY token.
            </p>
            <BenefitList
              items={[
                "Earn up to $25/day on Elite tier",
                "Watch videos you actually want to see",
                "Play games with your GPC (C-Lo, GarmonFour, Coin Flip)",
                "Cash out to $GPAY when token launches",
              ]}
            />
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 shadow-[0_0_40px_-12px_rgba(139,92,246,0.25)] md:order-1 md:p-8">
            <p className="mb-4 text-sm font-medium text-violet-200">
              Get early access
            </p>
            <WaitlistForm type="earner" source="homepage-earner" />
          </div>
        </div>
      </section>

      {/* Section 5 — Trust Strip */}
      <section className="bg-zinc-900/80 py-4">
        <p className="mx-auto max-w-6xl px-4 text-center text-xs text-zinc-400 sm:text-sm">
          Built on Solana | Stripe-powered payments | ToS-compliant distribution
        </p>
      </section>

      {/* Section 6 — Footer CTA */}
      <section className="px-4 py-16 tablet:pb-24">
        <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--gp-gold)]/30 bg-gradient-to-br from-[#1a0f2e]/95 to-[#0c0618] px-6 py-10 text-center md:px-12">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Join the waitlist. Launch is weeks away.
          </h2>
          <div className="mx-auto mt-8 max-w-md">
            <WaitlistForm
              type="general"
              source="homepage-footer"
              buttonLabel="Join Waitlist"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
