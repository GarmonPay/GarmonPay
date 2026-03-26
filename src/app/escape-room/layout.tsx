import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stake & Escape | GarmonPay",
  description: "Mobile-first skill escape room for GarmonPay members.",
};

export default function EscapeRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
