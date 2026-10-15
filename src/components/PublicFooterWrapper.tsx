"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";
import {isPublicGameRoute} from '@/config/public-game-routes';

/** Hides the marketing footer when the dashboard app shell is active. */
export function PublicFooterWrapper() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/member") ||
    (pathname.startsWith("/games") && !isPublicGameRoute(pathname))
  ) {
    return null;
  }
  return <Footer />;
}
