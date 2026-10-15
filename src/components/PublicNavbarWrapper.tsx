"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

/** Renders the marketing Navbar only on public routes (hidden in app shell routes). */
export function PublicNavbarWrapper() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/games") ||
    pathname.startsWith("/member")
  ) {
    return null;
  }
  return <Navbar />;
}
