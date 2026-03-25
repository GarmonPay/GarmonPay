import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const HOW_CARDS = [
  {
    title: "Advertisers pay us",
    body: "Advertisers pay GarmonPay to reach real human attention.",
  },
  {
    title: "We share it with you",
    body: "We distribute the majority of ad revenue directly to our members.",
  },
  {
    title: "You earn every day",
    body: "Members earn by watching ads, completing tasks, playing games, and referring friends.",
  },
  {
    title: "Everyone wins",
    body: "Advertisers get real engagement, members get real income, and GarmonPay grows sustainably.",
  },
] as const;

const TRUST = [
  {
    title: "Stripe-secured payments",
    body: "All transactions are processed through Stripe—the same payment system used by Amazon and Google.",
  },
  {
    title: "Real withdrawals",
    body: "Members withdraw real cash directly via Stripe.",
  },
  {
    title: "Anti-cheat protection",
    body: "Every earn action is validated server-side to keep earnings fair for honest members.",
  },
  {
    title: "Transparent earnings",
    body: "Every transaction is logged and visible in your dashboard.",
  },
  {
    title: "Worldwide access",
    body: "Members from countries worldwide can join and earn for free.",
  },
  {
    title: "No pay to play",
    body: "Free membership lets you earn from day one with no credit card required.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      <section className="relative overflow-hidden px-4 py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-violet-600/25 blur-[100px]" />
          <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[#eab308]/12 blur-[110px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1
            className={`${cinzel.className} text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl`}
          >
            <span className="bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
              We Built GarmonPay So Anyone Can Earn Online
            </span>
          </h1>
        </div>
      </section>

      <section className="border-t border-white/[0.06] bg-[#0a0514]/90 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>Our Mission</h2>
          <p className="mt-6 text-base leading-relaxed text-violet-200/90 sm:text-lg">
            GarmonPay was built on one simple belief — your attention has value. Every ad you watch, every task you
            complete, every person you refer represents real economic activity. We built GarmonPay to make sure you
            get your fair share of that value, not just the big corporations. We are a platform where members come
            first, earnings are transparent, and growth is unlimited.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className={`${cinzel.className} text-center text-2xl font-bold text-white md:text-3xl`}>
            How GarmonPay Works For You
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {HOW_CARDS.map((c) => (
              <article
                key={c.title}
                className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]"
              >
                <h3 className="text-lg font-semibold text-[#fde047]">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-violet-200/85">{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-[#080512]/95 px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className={`${cinzel.className} text-center text-2xl font-bold text-[#fde047] md:text-3xl`}>
            Why Trust GarmonPay
          </h2>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <li
                key={t.title}
                className="rounded-xl border border-[#eab308]/20 bg-black/30 p-5 text-left"
              >
                <h3 className="text-sm font-semibold text-white">{t.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-violet-200/80">{t.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#eab308]/35 bg-gradient-to-br from-[#1a0f2e]/95 to-[#0c0618] p-8 md:p-12">
          <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
            The GarmonPay Promise
          </h2>
          <p className="mt-6 text-base leading-relaxed text-violet-100/90 sm:text-lg">
            We will never disappear with your money. We will never cap your earning potential. We will always pay what
            we owe. GarmonPay is built to last.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24 pt-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className={`${cinzel.className} text-xl font-bold text-white md:text-2xl`}>Join Us</h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 sm:w-auto"
            >
              Start Earning Free
            </Link>
            <Link
              href="/advertise"
              className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[#eab308] px-10 py-4 text-base font-semibold text-[#fde047] transition hover:bg-[#eab308]/10 sm:w-auto"
            >
              Advertise With Us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
