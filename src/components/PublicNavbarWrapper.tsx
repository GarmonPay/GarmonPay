"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import {isPublicGameRoute} from '@/config/public-game-routes';

/** Renders the marketing Navbar only on public routes (hidden in app shell routes). */
export function PublicNavbarWrapper() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/member") ||
    (pathname.startsWith("/games") && !isPublicGameRoute(pathname))
  ) {
    return null;
  }
  return <Navbar />;
}
