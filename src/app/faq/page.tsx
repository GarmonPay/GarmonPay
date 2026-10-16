"use client";

import { useState } from "react";
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
        a: "GarmonPay is a Solana platform for launching a coin, promoting it, and discovering projects. Members can learn, play free games, and practice with virtual SOL. Purchases, payouts, deposits, withdrawals, and Mainnet trading are paused.",
      },
      {
        q: "How do I join?",
        a: "The wallet workspace uses Phantom, Solflare, Backpack, or another compatible Solana wallet. Connect Wallet signs a message. It does not require an email password and it does not approve a transaction. Older email accounts remain available and are not merged into the wallet profile.",
      },
      {
        q: "What countries can join?",
        a: "Availability can be limited by sanctions and local law. You must be at least 18.",
      },
      {
        q: "How old do I have to be?",
        a: "You must be at least 18 years old.",
      },
    ],
  },
  {
    title: "Rewards",
    items: [
      {
        q: "Can I earn money on GarmonPay today?",
        a: "No live reward balance is available. Eligible rewards would require a funded campaign and server-verified participation. Watching the homepage, playing a free game, or finishing a practice quiz does not create a payout.",
      },
      {
        q: "How much can I earn per day?",
        a: "GarmonPay does not publish a daily earnings amount. There is no guaranteed range, and referral activity does not create a withdrawable balance while payouts are paused.",
      },
      {
        q: "When are rewards credited?",
        a: "Nothing is credited as available money while financial operations are paused. A future eligible reward would be separate from a pending check.",
      },
    ],
  },
  {
    title: "Tokens and older coins",
    items: [
      {
        q: "Is there an official GPAY token?",
        a: "No. GarmonPay has not launched an official GPAY token. Do not treat an older GPC or Gold Coin balance as SOL or as a promised token redemption.",
      },
      {
        q: "What happened to GPC?",
        a: "Older GPC and Gold Coin records stay in the legacy account system. They are not part of the wallet platform, and this site does not convert them.",
      },
      {
        q: "Can I withdraw?",
        a: "Withdrawals are unavailable. Virtual paper SOL cannot be withdrawn.",
      },
    ],
  },
  {
    title: "Referrals",
    items: [
      {
        q: "Are referral payouts active?",
        a: "No. Referral payouts are paused. Older pages may describe membership commissions or a code-recorded advertising match. Those descriptions are not an active offer.",
      },
      {
        q: "Is there a limit on invitations?",
        a: "An invitation can be shared, but sharing it does not pay a commission while payouts are paused.",
      },
      {
        q: "When would a referral be paid?",
        a: "Not now. A future commission would require a qualifying event, a fraud review, and a separate decision to turn payouts on.",
      },
    ],
  },
  {
    title: "Membership pages",
    items: [
      {
        q: "Do I need a paid plan?",
        a: "No. The wallet workspace does not require a paid membership. The pricing page keeps an older catalog for reference. It is not a promise of live earnings.",
      },
      {
        q: "Can I cancel a membership?",
        a: "Older paid memberships, if you have one, are managed from the legacy account settings. Canceling a plan does not create a SOL withdrawal.",
      },
      {
        q: "What happens to an older balance?",
        a: "Historical account records stay stored. They are not converted into SOL and they are not redeemed for an official token.",
      },
    ],
  },
  {
    title: "Trust and Safety",
    items: [
      {
        q: "Does GarmonPay hold my wallet?",
        a: "No. Wallet sign-in proves you control an address. GarmonPay does not ask for a seed phrase or private key. If a wallet warns that a request is blocked, stop.",
      },
      {
        q: "How are games handled?",
        a: "Free play is available. Paid entry, wagers, and prize payouts stay off.",
      },
      {
        q: "Is my personal information safe?",
        a: "Read the Privacy Policy for what the site stores. Wallet sign-in uses the wallet address as the stable id. GarmonPay does not sell that as a promise of payment processing.",
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
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-white transition hover:text-[#e8c47a] sm:text-base"
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="shrink-0 text-[#e8c47a]">{open ? "−" : "+"}</span>
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-violet-200/85">{a}</p>}
    </div>
  );
}

export default function FaqPage() {
  return (
    <main id="main-content" className="gp-sol-page">
      <div className="mx-auto max-w-3xl">
        <p className="gp-sol-eyebrow">GARMONPAY</p>
        <h1>Frequently Asked Questions</h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-violet-200/85">
          Answers about the wallet platform, paused payouts, and older account pages. Nothing here turns payments on.
        </p>

        <div className="mt-14 space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
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
