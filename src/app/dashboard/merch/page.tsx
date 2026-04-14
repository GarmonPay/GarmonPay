import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export default function DashboardMerchPage() {
  return (
    <div
      className={`mx-auto max-w-lg px-4 py-16 text-center ${dmSans.className}`}
      style={{ background: "#0e0118" }}
    >
      <h1 className="text-2xl font-bold text-[#F5C842]">Merch Store</h1>
      <p className="mt-4 text-violet-200/80">Coming soon.</p>
    </div>
  );
}
