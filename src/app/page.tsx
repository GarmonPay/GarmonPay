import dynamic from "next/dynamic";

const AdDisplay = dynamic(() => import("@/components/AdDisplay").then((m) => ({ default: m.AdDisplay })), { ssr: false });

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#12081f] via-[#0c0618] to-[#05020a] text-white flex flex-col items-center justify-center py-12">

      <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#eab308] to-[#fbbf24] bg-clip-text text-transparent">
        GarmonPay
      </h1>

      <p className="text-xl text-violet-300 mb-8">
        Get Seen. Get Known. Get Paid.
      </p>

      <div className="flex flex-wrap justify-center gap-4">

        <a
          href="/login"
          className="bg-violet-600 hover:bg-violet-500 px-6 py-3 rounded-lg font-semibold text-white shadow-lg shadow-violet-900/40"
        >
          Login
        </a>

        <a
          href="/register"
          className="bg-fintech-bg-card border border-violet-500/30 hover:border-violet-400/50 px-6 py-3 rounded-lg font-semibold"
        >
          Register
        </a>

        <a
          href="/advertise"
          className="border-2 border-[#eab308] text-[#fde047] hover:bg-[#eab308]/15 px-6 py-3 rounded-lg font-semibold"
        >
          Advertise
        </a>

      </div>

      <a
        href="/wallet"
        className="mt-6 text-[#eab308] underline underline-offset-2 hover:text-[#fde047]"
      >
        Go to Wallet
      </a>
      <a
        href="/pricing"
        className="mt-2 inline-block text-sm text-fintech-muted hover:text-violet-200"
      >
        Plans &amp; ad packages
      </a>

      <div className="mt-10 w-full max-w-md">
        <AdDisplay placement="homepage" />
      </div>
    </main>
  )
}
