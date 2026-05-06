"use client";

import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export type GarmonPayWordmarkProps = {
  href?: string;
  className?: string;
};

/**
 * Gold Cinzel Decorative wordmark — same styling as the public marketing navbar.
 */
export function GarmonPayWordmark({
  href = "/",
  className = "",
}: GarmonPayWordmarkProps) {
  return (
    <Link
      href={href}
      className={`${cinzel.className} shrink-0 text-xl font-bold bg-gradient-to-r from-[#eab308] to-[#fbbf24] bg-clip-text text-transparent no-underline ${className}`}
    >
      GarmonPay
    </Link>
  );
}
