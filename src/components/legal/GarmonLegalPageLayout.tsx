import { DM_Sans, Cinzel_Decorative } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cinzelDecorative = Cinzel_Decorative({
  weight: "400",
  subsets: ["latin"],
});

export const garmonLegalHeadingClassName = cinzelDecorative.className;

export function GarmonLegalPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${dmSans.className} min-h-screen text-[#fafafa]`}
      style={{ backgroundColor: "#0e0118" }}
    >
      {children}
    </div>
  );
}
