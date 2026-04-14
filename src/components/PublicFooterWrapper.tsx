"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

/** Hides the marketing footer when the dashboard app shell is active. */
export function PublicFooterWrapper() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/games")
  ) {
    return null;
  }
  return <Footer />;
}
