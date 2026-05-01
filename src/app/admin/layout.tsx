import { Cinzel_Decorative, DM_Sans } from "next/font/google";

const cinzelDisplay = Cinzel_Decorative({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-admin-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-admin-body",
  display: "swap",
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${cinzelDisplay.variable} ${dmSans.variable} min-h-screen bg-[#0e0118] font-[family-name:var(--font-admin-body)] text-white antialiased`}
    >
      {children}
    </div>
  );
}
