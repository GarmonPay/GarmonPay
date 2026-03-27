"use client";

import { useState } from "react";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

type Section = {
  title: string;
  items: { q: string; a: string }[];
};

const SECTIONS: Section[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "What is GarmonPay?",
        a: "GarmonPay is a rewards platform where members earn real money by watching ads, completing tasks, playing games, and referring friends. It is completely free to join with no credit card required.",
      },
      {
        q: "Is GarmonPay free to join?",
        a: "Yes. Creating an account and earning on GarmonPay is completely free. We offer optional paid membership plans that multiply your earning rates, but free members earn from day one.",
      },
      {
        q: "What countries can join?",
        a: "GarmonPay is open to members worldwide except countries that are subject to international sanctions or restrictions.",
      },
      {
        q: "How old do I have to be?",
        a: "You must be at least 18 years old to create a GarmonPay account.",
      },
    ],
  },
  {
    title: "Earning",
    items: [
      {
        q: "How do I earn money on GarmonPay?",
        a: "You earn by watching ads, clicking tasks, completing daily missions, playing games, and referring new members. Every action is tracked and credited to your balance in real time.",
      },
      {
        q: "How much can I earn per day?",
        a: "Earnings vary based on your activity level and membership plan. Free members typically earn between $0.50 and $3.00 per day from personal activity. With an active referral network your earnings can grow significantly beyond that.",
      },
      {
        q: "Is there a limit to how much I can earn?",
        a: "No. There is no cap on your total earnings. The more active you are and the larger your referral network the more you earn. Elite members with large networks regularly earn thousands per month.",
      },
      {
        q: "When are earnings credited?",
        a: "Earnings are credited to your GarmonPay balance in real time as you complete actions.",
      },
    ],
  },
  {
    title: "Withdrawals",
    items: [
      {
        q: "How do I withdraw my earnings?",
        a: "Withdrawals are processed through Stripe. You can request a withdrawal from your dashboard once you reach your plan minimum.",
      },
      {
        q: "How long do withdrawals take?",
        a: "Withdrawals typically process within 1 to 5 business days depending on your bank.",
      },
      {
        q: "What is the minimum withdrawal?",
        a: "The minimum withdrawal depends on your membership plan. Free members have a $20 minimum. Starter members $10. Growth members $5. Pro members $2. Elite members $1.",
      },
      {
        q: "Are there withdrawal fees?",
        a: "GarmonPay does not charge withdrawal fees. Standard Stripe processing fees may apply depending on your region.",
      },
    ],
  },
  {
    title: "Referrals",
    items: [
      {
        q: "How does the referral program work?",
        a: "When someone signs up using your unique referral link you instantly earn $0.50. When they upgrade their membership plan you earn a percentage of their upgrade price. Free members earn 10 percent. Starter members earn 20 percent. Growth members earn 30 percent. Pro members earn 40 percent. Elite members earn 50 percent. You do not earn from their ad views or clicks. Only from sign ups and membership upgrades.",
      },
      {
        q: "Is there a limit on how many people I can refer?",
        a: "No limit. You can refer unlimited people and earn from all of them indefinitely.",
      },
      {
        q: "When do I get paid for referrals?",
        a: "Referral commissions are credited to your balance in real time whenever your referral completes an earning action.",
      },
    ],
  },
  {
    title: "Membership Plans",
    items: [
      {
        q: "Do I need a paid plan to earn?",
        a: "No. Free members earn from day one. Paid plans multiply your earning rates and unlock higher referral commissions, faster withdrawals, and exclusive features.",
      },
      {
        q: "Can I cancel my membership?",
        a: "Yes. You can cancel your paid membership at any time from your account settings. Your account remains active on the Free plan after cancellation.",
      },
      {
        q: "What happens to my earnings if I cancel?",
        a: "Your earned balance is yours regardless of your plan status. You can still withdraw your existing balance after cancelling.",
      },
    ],
  },
  {
    title: "Trust and Safety",
    items: [
      {
        q: "Is GarmonPay legit?",
        a: "Yes. GarmonPay is a real platform that pays real members. All payments are processed through Stripe. Every transaction is logged and visible in your dashboard.",
      },
      {
        q: "How does GarmonPay prevent cheating?",
        a: "We use browser fingerprinting, server-side timer validation, VPN and bot detection, and anomaly scoring to ensure every earn action is legitimate. Accounts that attempt to cheat are suspended and earnings are forfeited.",
      },
      {
        q: "Is my personal information safe?",
        a: "Yes. We use industry-standard encryption and Stripe for all payment processing. We never sell your personal data. See our Privacy Policy for full details.",
      },
    ],
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.08] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-white transition hover:text-[#fde047] sm:text-base"
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="shrink-0 text-[#eab308]">{open ? "−" : "+"}</span>
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-violet-200/85">{a}</p>}
    </div>
  );
}

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <h1
          className={`${cinzel.className} text-center text-3xl font-bold sm:text-4xl md:text-5xl`}
        >
          <span className="bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
            Frequently Asked Questions
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-violet-200/85">
          Everything you need to know about earning, withdrawals, and trust on GarmonPay.
        </p>

        <div className="mt-14 space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047]`}>{section.title}</h2>
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#12081f]/90 px-4 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)] sm:px-6">
                {section.items.map((item) => (
                  <AccordionItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
