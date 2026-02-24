"use client";

import Link from "next/link";

export default function MobileNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black flex justify-around p-3 md:hidden">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/dashboard/games">Games</Link>
      <Link href="/dashboard/games/boxing">Boxing</Link>
      <Link href="/dashboard/profile">Profile</Link>
    </div>
  );
}
