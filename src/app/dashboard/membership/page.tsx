import Link from "next/link";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export default function DashboardMembershipPage() {
  return (
    <div className={`mx-auto max-w-lg px-4 py-10 ${dmSans.className}`}>
      <h1 className="text-2xl font-bold text-[#F5C842]">Membership</h1>
      <p className="mt-3 leading-relaxed text-violet-200/85">
        Compare plans and upgrade to unlock more features.
      </p>
      <Link
        href="/pricing"
        className="mt-8 inline-flex rounded-2xl px-6 py-3 text-base font-semibold text-white transition-opacity hover:opacity-95"
        style={{ background: "#7C3AED" }}
      >
        Upgrade Plan →
      </Link>
    </div>
  );
}
