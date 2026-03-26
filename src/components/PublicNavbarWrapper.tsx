"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

/** Renders the marketing Navbar only on public routes (hidden under /dashboard and /admin). */
export function PublicNavbarWrapper() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/escape-room/play")
  ) {
    return null;
  }
  return <Navbar />;
}
